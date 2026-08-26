//! The fonts on this machine, by the names a subtitle asks for.
//!
//! A script names the faces it wants, "Arial", "Segoe UI", "Noto Naskh
//! Arabic", and expects the player to have them, because every player until
//! now has been a program on a computer with fonts on it. libass here runs
//! inside the webview, which is a browser, and a browser is not allowed to read
//! the fonts on the machine it is running on without asking the person first.
//!
//! Nothing good comes of asking. A permission prompt for a font is a question
//! nobody can answer usefully, and the answer to it while the film is already
//! playing is no. So the shell, which is an ordinary program and has no such
//! problem, reads them and hands over the one that was asked for.
//!
//! Without this an Arabic subtitle is rendered in a font that has no Arabic in
//! it, and every letter comes out as an empty box. It is not a nicety.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::OnceLock;

/// Every installed face, by the name it answers to, lowercased.
///
/// Read once. Fonts are installed by a person at a keyboard, which does not
/// happen while a film is playing.
pub fn installed() -> &'static BTreeMap<String, PathBuf> {
    static FONTS: OnceLock<BTreeMap<String, PathBuf>> = OnceLock::new();
    FONTS.get_or_init(read)
}

/// The file a name refers to, if this machine has it.
pub fn path(name: &str) -> Option<&'static PathBuf> {
    installed().get(&name.trim().to_lowercase())
}

/// Every name, for handing to the renderer as the list of what it may ask for.
pub fn names() -> Vec<&'static str> {
    installed().keys().map(String::as_str).collect()
}

/// Strip what Windows adds to a font's name in the registry, and split the
/// collections.
///
/// The value is a display name rather than a family name: `Arial (TrueType)`,
/// or for a file holding several faces `MS Gothic & MS PGothic (TrueType)`. A
/// script asks for `Arial`, so the decoration comes off and the collection
/// comes apart.
fn names_from(entry: &str) -> Vec<String> {
    let bare = match entry.rfind(" (") {
        Some(at) if entry.ends_with(')') => &entry[..at],
        _ => entry,
    };

    bare.split('&')
        .map(|name| name.trim().to_lowercase())
        .filter(|name| !name.is_empty())
        .collect()
}

#[cfg(windows)]
fn read() -> BTreeMap<String, PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const FONTS: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts";
    let directory =
        PathBuf::from(std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into()))
            .join("Fonts");

    let mut found = BTreeMap::new();

    // The machine's fonts first and the person's second, so that a face they
    // installed for themselves wins over one of the same name that shipped.
    for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let Ok(key) = RegKey::predef(root).open_subkey(FONTS) else {
            continue;
        };

        for (entry, value) in key.enum_values().flatten() {
            let file = value.to_string();
            if file.is_empty() {
                continue;
            }
            // The machine's are named relative to the fonts directory; a
            // person's are written out in full.
            let file = PathBuf::from(&file);
            let file = if file.is_absolute() {
                file
            } else {
                directory.join(file)
            };

            for name in names_from(&entry) {
                found.insert(name, file.clone());
            }
        }
    }

    found
}

/// Elsewhere there is no registry to read, and the renderer falls back to the
/// face shipped with it.
#[cfg(not(windows))]
fn read() -> BTreeMap<String, PathBuf> {
    BTreeMap::new()
}

#[cfg(test)]
mod tests {
    use super::names_from;

    #[test]
    fn the_kind_of_file_is_not_part_of_the_name() {
        assert_eq!(names_from("Arial (TrueType)"), vec!["arial"]);
        assert_eq!(
            names_from("Segoe UI Bold (TrueType)"),
            vec!["segoe ui bold"]
        );
    }

    /// One file, several faces. A script asking for either should find it.
    #[test]
    fn a_collection_comes_apart() {
        assert_eq!(
            names_from("MS Gothic & MS PGothic & MS UI Gothic (TrueType)"),
            vec!["ms gothic", "ms pgothic", "ms ui gothic"],
        );
    }

    /// A name with brackets of its own keeps them.
    #[test]
    fn only_the_trailing_note_is_removed() {
        assert_eq!(names_from("Noto Sans"), vec!["noto sans"]);
        assert_eq!(names_from("Font (Beta) (OpenType)"), vec!["font (beta)"]);
    }

    /// Every machine this runs on has fonts, and finding none would mean the
    /// Arabic in every script came out as boxes.
    #[cfg(windows)]
    #[test]
    fn this_machine_has_fonts() {
        assert!(super::installed().len() > 10);
        assert!(super::path("Arial").is_some());
    }
}
