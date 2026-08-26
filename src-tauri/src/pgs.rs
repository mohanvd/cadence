//! Reading the subtitles a Blu-ray carries.
//!
//! PGS is not text. Every line is a small picture, drawn by whoever authored
//! the disc, in whatever font and colour they chose, already positioned on the
//! frame. That is why it is on Blu-rays at all: a disc player has no fonts and
//! no text layout, and a picture needs neither.
//!
//! It is often said that showing these means OCR. It does not. OCR is for
//! turning them back into words, to search them, to restyle them, to feed
//! them to something that reads aloud. Showing one only means decoding a small
//! image, which is what this file does. The distinction matters because the
//! first is a research problem and the second is an afternoon.
//!
//! What arrives here is the raw stream FFmpeg lifts out of the container with
//! `-c:s copy`. Nothing is decoded on the way, so the whole track for a film
//! is a few hundred kilobytes and the extraction is a pass over the container
//! rather than a pass over the video.

use std::collections::HashMap;

/// One picture, with when and where it is shown.
///
/// Coordinates are on the authoring canvas, which is the video's own frame
/// size at the time the disc was made, usually 1920×1080. The page scales
/// them to whatever size it is actually painting at.
pub struct Cue {
    pub start: f64,
    pub end: f64,
    pub x: u16,
    pub y: u16,
    pub width: u16,
    pub height: u16,
    pub png: Vec<u8>,
}

/// A whole subtitle track, and the canvas its coordinates are measured against.
pub struct Track {
    pub width: u16,
    pub height: u16,
    pub cues: Vec<Cue>,
}

/* Segment types, from the specification. A stream is nothing but a sequence of
these, each carrying a 90kHz presentation time. */
const PALETTE: u8 = 0x14;
const OBJECT: u8 = 0x15;
const COMPOSITION: u8 = 0x16;
const WINDOW: u8 = 0x17;
const END: u8 = 0x80;

/// A composition seen but not yet drawn.
///
/// The segments that a screenful is made of arrive in a fixed order, what to
/// show, then the palette, then the picture, then an end marker, so the
/// composition names an object that has not been read yet. Drawing waits for
/// the end marker, by which time everything it refers to has arrived.
struct Set {
    start: f64,
    palette: u8,
    placements: Vec<Placement>,
}

struct Placement {
    object: u16,
    x: u16,
    y: u16,
    /// A window onto the object, when the disc shows only part of one.
    crop: Option<(u16, u16, u16, u16)>,
}

/// A picture, still run-length encoded.
///
/// Held encoded because a large one is split across several segments and only
/// makes sense once they are all in. `wanted` is what the first segment said
/// the total would be, and is how the last one is recognised.
struct Object {
    width: u16,
    height: u16,
    data: Vec<u8>,
    wanted: usize,
}

/// A displayed cue whose end time has not happened yet.
struct Open {
    start: f64,
    x: u16,
    y: u16,
    width: u16,
    height: u16,
    png: Vec<u8>,
}

fn u16be(bytes: &[u8]) -> u16 {
    u16::from_be_bytes([bytes[0], bytes[1]])
}

fn u32be(bytes: &[u8]) -> u32 {
    u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

/// Read a `.sup` stream into cues.
///
/// Damage is survived rather than reported. A rip with a truncated final
/// segment, or one segment whose length runs past the end of the file, should
/// cost the viewer that one line and not the whole track, so the loop stops
/// where it can no longer make sense of the bytes and returns what it read.
pub fn read(stream: &[u8]) -> Track {
    let mut palettes: HashMap<u8, Vec<[u8; 4]>> = HashMap::new();
    let mut objects: HashMap<u16, Object> = HashMap::new();
    let mut pending: Option<Set> = None;
    let mut open: Option<Open> = None;
    let mut cues: Vec<Cue> = Vec::new();
    let mut canvas = (0u16, 0u16);
    let mut cursor = 0usize;
    let mut latest = 0.0f64;

    // Two bytes of magic, four of presentation time, four of decode time, one
    // of type and two of length.
    while cursor + 13 <= stream.len() {
        if &stream[cursor..cursor + 2] != b"PG" {
            break;
        }
        let at = f64::from(u32be(&stream[cursor + 2..])) / 90_000.0;
        let kind = stream[cursor + 10];
        let length = usize::from(u16be(&stream[cursor + 11..]));
        let body = cursor + 13;
        let Some(payload) = stream.get(body..body + length) else {
            break;
        };
        cursor = body + length;
        latest = at;

        match kind {
            COMPOSITION => pending = composition(payload, at, &mut canvas),
            PALETTE => palette(payload, &mut palettes),
            OBJECT => object(payload, &mut objects),
            // Windows say where on screen a composition is allowed to draw.
            // Every object already carries its own position, and no player is
            // obliged to clip to the window, so there is nothing to keep.
            WINDOW => {}
            END => {
                // Whatever was on screen stops being on screen now, whether
                // this set replaces it or clears it.
                if let Some(shown) = open.take() {
                    cues.push(close(shown, at));
                }
                if let Some(set) = pending.take() {
                    open = draw(&set, &objects, &palettes);
                }
            }
            _ => {}
        }
    }

    // A track whose last cue is never cleared. Five seconds is long enough to
    // read and short enough not to sit over the credits.
    if let Some(shown) = open {
        let end = if latest > shown.start {
            latest
        } else {
            shown.start + 5.0
        };
        cues.push(close(shown, end));
    }

    Track {
        width: canvas.0,
        height: canvas.1,
        cues,
    }
}

fn close(shown: Open, end: f64) -> Cue {
    Cue {
        start: shown.start,
        end,
        x: shown.x,
        y: shown.y,
        width: shown.width,
        height: shown.height,
        png: shown.png,
    }
}

/// What is to be shown, and where.
///
/// A composition with no objects in it is how the format says "nothing", it
/// is the instruction to clear the screen, and it is what gives the previous
/// cue its end time.
fn composition(payload: &[u8], at: f64, canvas: &mut (u16, u16)) -> Option<Set> {
    if payload.len() < 11 {
        return None;
    }
    *canvas = (u16be(payload), u16be(&payload[2..]));

    let palette = payload[9];
    let count = usize::from(payload[10]);
    let mut placements = Vec::with_capacity(count);
    let mut cursor = 11;

    for _ in 0..count {
        if payload.len() < cursor + 8 {
            break;
        }
        let object = u16be(&payload[cursor..]);
        let cropped = payload[cursor + 3] & 0x40 != 0;
        let x = u16be(&payload[cursor + 4..]);
        let y = u16be(&payload[cursor + 6..]);
        cursor += 8;

        let crop = if cropped {
            if payload.len() < cursor + 8 {
                break;
            }
            let window = (
                u16be(&payload[cursor..]),
                u16be(&payload[cursor + 2..]),
                u16be(&payload[cursor + 4..]),
                u16be(&payload[cursor + 6..]),
            );
            cursor += 8;
            Some(window)
        } else {
            None
        };

        placements.push(Placement { object, x, y, crop });
    }

    (!placements.is_empty()).then_some(Set {
        start: at,
        palette,
        placements,
    })
}

/// Colours, as luma and two differences.
///
/// Entries arrive a few at a time and accumulate: a palette segment is an
/// amendment to the palette it names, not a replacement for it. Anything never
/// named stays transparent, which is what an index nobody defined means.
fn palette(payload: &[u8], palettes: &mut HashMap<u8, Vec<[u8; 4]>>) {
    if payload.len() < 2 {
        return;
    }
    let table = palettes
        .entry(payload[0])
        .or_insert_with(|| vec![[0, 0, 0, 0]; 256]);

    for entry in payload[2..].chunks_exact(5) {
        table[usize::from(entry[0])] = rgba(entry[1], entry[2], entry[3], entry[4]);
    }
}

/// One colour, converted the way FFmpeg's own decoder converts it.
///
/// Studio-range BT.601. Not because BT.601 is right for high definition, it
/// is not, but because every player that reads these treats the palette that
/// way, so the discs were authored against it. Matching the specification here
/// and not the practice would shift the colour of every subtitle ever pressed.
fn rgba(y: u8, cr: u8, cb: u8, alpha: u8) -> [u8; 4] {
    let luma = (f64::from(y) - 16.0) * 255.0 / 219.0;
    let cb = f64::from(cb) - 128.0;
    let cr = f64::from(cr) - 128.0;
    let clip = |value: f64| value.clamp(0.0, 255.0).round() as u8;

    [
        clip(luma + 1.402 * 255.0 / 224.0 * cr),
        clip(luma - 0.344_14 * 255.0 / 224.0 * cb - 0.714_14 * 255.0 / 224.0 * cr),
        clip(luma + 1.772 * 255.0 / 224.0 * cb),
        alpha,
    ]
}

/// A picture, possibly one segment's worth of a larger one.
fn object(payload: &[u8], objects: &mut HashMap<u16, Object>) {
    if payload.len() < 4 {
        return;
    }
    let id = u16be(payload);
    let sequence = payload[3];
    let first = sequence & 0x80 != 0;

    if first {
        // Three bytes of total length, then the size, then the pixels. The
        // length counts the size fields too, which is why four comes off it.
        if payload.len() < 11 {
            return;
        }
        let wanted = (usize::from(payload[4]) << 16)
            | (usize::from(payload[5]) << 8)
            | usize::from(payload[6]);
        objects.insert(
            id,
            Object {
                width: u16be(&payload[7..]),
                height: u16be(&payload[9..]),
                data: payload[11..].to_vec(),
                wanted: wanted.saturating_sub(4),
            },
        );
    } else if let Some(existing) = objects.get_mut(&id) {
        existing.data.extend_from_slice(&payload[4..]);
    }

    // A continuation for an object whose opening segment was lost is dropped
    // by the branch above. One that overruns what it promised is trimmed here,
    // so a decode never reads past what the stream said it had.
    if let Some(existing) = objects.get_mut(&id) {
        if existing.data.len() > existing.wanted {
            existing.data.truncate(existing.wanted);
        }
    }
}

/// Paint a composition into a single image.
///
/// The result is trimmed to the pixels that are actually opaque. The authoring
/// canvas is 1920 wide and a line of dialogue is not, so an object arrives with
/// a great deal of nothing around it; keeping that would mean a larger PNG for
/// every cue and a placement that is only right because the emptiness happens
/// to line up.
fn draw(
    set: &Set,
    objects: &HashMap<u16, Object>,
    palettes: &HashMap<u8, Vec<[u8; 4]>>,
) -> Option<Open> {
    let colours = palettes.get(&set.palette)?;

    // Where the composition as a whole sits, before trimming.
    let mut left = u16::MAX;
    let mut top = u16::MAX;
    let mut right = 0u16;
    let mut bottom = 0u16;
    let mut parts = Vec::new();

    for placement in &set.placements {
        let Some(object) = objects.get(&placement.object) else {
            continue;
        };
        let (width, height) = match placement.crop {
            Some((_, _, width, height)) => (width.min(object.width), height.min(object.height)),
            None => (object.width, object.height),
        };
        if width == 0 || height == 0 {
            continue;
        }
        left = left.min(placement.x);
        top = top.min(placement.y);
        right = right.max(placement.x.saturating_add(width));
        bottom = bottom.max(placement.y.saturating_add(height));
        parts.push((placement, object, width, height));
    }

    if parts.is_empty() || right <= left || bottom <= top {
        return None;
    }

    let span = usize::from(right - left);
    let rows = usize::from(bottom - top);
    /* One palette index per pixel, not four bytes of colour. The pictures
    arrive palettised and leave palettised, a PNG can hold them that way,
    so resolving to colour here would be spending four times the memory to
    throw the saving away again at the encoder. */
    let mut canvas = vec![0u8; span * rows];

    for (placement, object, width, height) in parts {
        let indices = unpack(&object.data, object.width, object.height);
        let (from_x, from_y) = match placement.crop {
            Some((x, y, _, _)) => (usize::from(x), usize::from(y)),
            None => (0, 0),
        };
        let to_x = usize::from(placement.x - left);
        let to_y = usize::from(placement.y - top);

        for row in 0..usize::from(height) {
            let source = (from_y + row) * usize::from(object.width) + from_x;
            let target = (to_y + row) * span + to_x;
            for column in 0..usize::from(width) {
                let Some(index) = indices.get(source + column) else {
                    break;
                };
                // Later objects in a composition sit on top of earlier ones,
                // and anything transparent leaves what is beneath it alone.
                if colours[usize::from(*index)][3] == 0 {
                    continue;
                }
                if let Some(pixel) = canvas.get_mut(target + column) {
                    *pixel = *index;
                }
            }
        }
    }

    let mut drawn = trim(&canvas, colours, span, rows, left, top)?;
    drawn.start = set.start;
    Some(drawn)
}

/// Cut away fully transparent edges and encode what is left.
fn trim(
    canvas: &[u8],
    colours: &[[u8; 4]],
    span: usize,
    rows: usize,
    left: u16,
    top: u16,
) -> Option<Open> {
    let opaque = |x: usize, y: usize| colours[usize::from(canvas[y * span + x])][3] != 0;

    let first_row = (0..rows).find(|&y| (0..span).any(|x| opaque(x, y)))?;
    let last_row = (0..rows).rev().find(|&y| (0..span).any(|x| opaque(x, y)))?;
    let first_column = (0..span).find(|&x| (first_row..=last_row).any(|y| opaque(x, y)))?;
    let last_column = (0..span)
        .rev()
        .find(|&x| (first_row..=last_row).any(|y| opaque(x, y)))?;

    let width = last_column - first_column + 1;
    let height = last_row - first_row + 1;
    let mut pixels = Vec::with_capacity(width * height);
    for y in first_row..=last_row {
        let start = y * span + first_column;
        pixels.extend_from_slice(&canvas[start..start + width]);
    }

    Some(Open {
        start: 0.0,
        x: left + first_column as u16,
        y: top + first_row as u16,
        width: width as u16,
        height: height as u16,
        png: encode(&pixels, colours, width as u32, height as u32)?,
    })
}

/// Write the picture out as a PNG, palette and all.
///
/// Indexed rather than full colour, because that is what a PGS picture already
/// is. The format's own palette becomes the PNG's, its transparency becomes the
/// PNG's, and a line of dialogue takes a byte a pixel before compression rather
/// than four. A film's worth of them is the difference between holding a few
/// megabytes and holding rather more than a few.
fn encode(pixels: &[u8], colours: &[[u8; 4]], width: u32, height: u32) -> Option<Vec<u8>> {
    let mut palette = Vec::with_capacity(colours.len() * 3);
    let mut alpha = Vec::with_capacity(colours.len());
    for colour in colours {
        palette.extend_from_slice(&colour[..3]);
        alpha.push(colour[3]);
    }

    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Indexed);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_palette(palette);
        encoder.set_trns(alpha);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(pixels).ok()?;
    }
    Some(out)
}

/// Undo the run-length encoding, into one palette index per pixel.
///
/// Rows are encoded independently and each ends with a marker, so a row that
/// decodes to the wrong length cannot corrupt the next one, the writer's
/// mistake stays on its own line.
fn unpack(data: &[u8], width: u16, height: u16) -> Vec<u8> {
    let span = usize::from(width);
    let mut pixels = vec![0u8; span * usize::from(height)];
    let mut cursor = 0usize;
    let mut x = 0usize;
    let mut y = 0usize;

    while cursor < data.len() && y < usize::from(height) {
        let byte = data[cursor];
        cursor += 1;

        // Anything other than zero is one pixel of that colour.
        if byte != 0 {
            if x < span {
                pixels[y * span + x] = byte;
            }
            x += 1;
            continue;
        }

        let Some(&flags) = data.get(cursor) else {
            break;
        };
        cursor += 1;

        if flags == 0 {
            y += 1;
            x = 0;
            continue;
        }

        // The top two bits say whether the run's length needs a second byte
        // and whether a colour follows; the low six are the length, or its
        // high half when it does not fit in six bits.
        let long = flags & 0x40 != 0;
        let coloured = flags & 0x80 != 0;
        let mut run = usize::from(flags & 0x3F);

        if long {
            let Some(&low) = data.get(cursor) else { break };
            cursor += 1;
            run = (run << 8) | usize::from(low);
        }

        let colour = if coloured {
            let Some(&index) = data.get(cursor) else {
                break;
            };
            cursor += 1;
            index
        } else {
            0
        };

        let end = (x + run).min(span);
        if colour != 0 {
            for pixel in &mut pixels[y * span + x..y * span + end] {
                *pixel = colour;
            }
        }
        x += run;
    }

    pixels
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build one segment the way the format does.
    fn segment(kind: u8, at: f64, payload: &[u8]) -> Vec<u8> {
        let pts = (at * 90_000.0) as u32;
        let mut out = b"PG".to_vec();
        out.extend_from_slice(&pts.to_be_bytes());
        out.extend_from_slice(&0u32.to_be_bytes());
        out.push(kind);
        out.extend_from_slice(&(payload.len() as u16).to_be_bytes());
        out.extend_from_slice(payload);
        out
    }

    /// A composition holding one object at a position.
    fn composition_at(x: u16, y: u16) -> Vec<u8> {
        let mut out = vec![0x07, 0x80, 0x04, 0x38, 0x10, 0, 0, 0x80, 0, 0, 1];
        out.extend_from_slice(&0u16.to_be_bytes());
        out.extend_from_slice(&[0, 0]);
        out.extend_from_slice(&x.to_be_bytes());
        out.extend_from_slice(&y.to_be_bytes());
        out
    }

    fn clearing() -> Vec<u8> {
        vec![0x07, 0x80, 0x04, 0x38, 0x10, 0, 1, 0x00, 0, 0, 0]
    }

    /// White at index 1, opaque.
    fn white() -> Vec<u8> {
        vec![0, 0, 1, 235, 128, 128, 255]
    }

    /// A `width` by `height` block, every pixel index 1.
    fn block(width: u16, height: u16) -> Vec<u8> {
        let mut rle = Vec::new();
        for _ in 0..height {
            rle.extend_from_slice(&[0x00, 0x80 | width as u8, 0x01, 0x00, 0x00]);
        }
        let mut out = vec![0, 0, 0, 0xC0];
        let total = (rle.len() + 4) as u32;
        out.extend_from_slice(&total.to_be_bytes()[1..]);
        out.extend_from_slice(&width.to_be_bytes());
        out.extend_from_slice(&height.to_be_bytes());
        out.extend_from_slice(&rle);
        out
    }

    fn stream() -> Vec<u8> {
        let mut out = Vec::new();
        out.extend(segment(COMPOSITION, 1.0, &composition_at(100, 900)));
        out.extend(segment(PALETTE, 1.0, &white()));
        out.extend(segment(OBJECT, 1.0, &block(20, 10)));
        out.extend(segment(END, 1.0, &[]));
        out.extend(segment(COMPOSITION, 5.0, &clearing()));
        out.extend(segment(END, 5.0, &[]));
        out
    }

    #[test]
    fn a_cue_keeps_its_place_on_the_frame() {
        let track = read(&stream());
        assert_eq!(track.cues.len(), 1);
        let cue = &track.cues[0];
        assert_eq!((cue.x, cue.y), (100, 900));
        assert_eq!((cue.width, cue.height), (20, 10));
        assert_eq!((track.width, track.height), (1920, 1080));
    }

    #[test]
    fn a_clearing_composition_ends_the_cue() {
        let track = read(&stream());
        assert_eq!(track.cues[0].start, 1.0);
        assert_eq!(track.cues[0].end, 5.0);
    }

    #[test]
    fn what_comes_out_is_a_png() {
        let track = read(&stream());
        assert_eq!(&track.cues[0].png[..8], b"\x89PNG\r\n\x1a\n");
    }

    /// The picture is a block in a corner of a much larger object. What is
    /// kept should be the block, placed where the block is, not the object.
    #[test]
    fn empty_space_around_a_line_is_not_carried() {
        let mut rle = Vec::new();
        rle.extend_from_slice(&[0x00, 0x30, 0x00, 0x00]); // 48 blank, end of row
        rle.extend_from_slice(&[0x00, 0x10, 0x00, 0x84, 0x01, 0x00, 0x00]); // 16 blank, 4 white
        let mut object = vec![0, 0, 0, 0xC0];
        let total = (rle.len() + 4) as u32;
        object.extend_from_slice(&total.to_be_bytes()[1..]);
        object.extend_from_slice(&48u16.to_be_bytes());
        object.extend_from_slice(&2u16.to_be_bytes());
        object.extend_from_slice(&rle);

        let mut out = Vec::new();
        out.extend(segment(COMPOSITION, 0.5, &composition_at(200, 800)));
        out.extend(segment(PALETTE, 0.5, &white()));
        out.extend(segment(OBJECT, 0.5, &object));
        out.extend(segment(END, 0.5, &[]));
        out.extend(segment(COMPOSITION, 2.0, &clearing()));
        out.extend(segment(END, 2.0, &[]));

        let track = read(&out);
        let cue = &track.cues[0];
        assert_eq!((cue.width, cue.height), (4, 1));
        assert_eq!((cue.x, cue.y), (216, 801));
    }

    /// A track that stops mid-segment costs the reader that segment and no
    /// more: the cues it had already finished are still returned.
    #[test]
    fn a_truncated_stream_keeps_what_it_read() {
        let whole = stream();
        let track = read(&whole[..whole.len() - 3]);
        assert_eq!(track.cues.len(), 1);
    }

    #[test]
    fn a_cue_nobody_cleared_still_ends() {
        let mut out = Vec::new();
        out.extend(segment(COMPOSITION, 3.0, &composition_at(0, 0)));
        out.extend(segment(PALETTE, 3.0, &white()));
        out.extend(segment(OBJECT, 3.0, &block(8, 8)));
        out.extend(segment(END, 3.0, &[]));

        let track = read(&out);
        assert_eq!(track.cues.len(), 1);
        assert_eq!(track.cues[0].end, 8.0);
    }

    #[test]
    fn nothing_at_all_is_not_an_error() {
        let track = read(&[]);
        assert!(track.cues.is_empty());
    }

    /// The long form of a run: two bytes of length, so more than 63 pixels.
    #[test]
    fn a_run_longer_than_six_bits_is_read_whole() {
        let mut rle = vec![0x00, 0xC0, 100, 0x01, 0x00, 0x00];
        rle.extend_from_slice(&[0x00, 0x00]);
        let pixels = unpack(&rle, 120, 2);
        assert_eq!(pixels[..100], [1u8; 100]);
        assert_eq!(pixels[100..120], [0u8; 20]);
    }
}
