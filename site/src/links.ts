const REPO = 'https://github.com/mohanvd/cadence';

export const REPO_URL = REPO;
export const RELEASES_URL = `${REPO}/releases`;

/**
 * The installer, addressed through `releases/latest` rather than by version.
 *
 * A built page is a static artifact that outlives the release it was built
 * beside. Naming a version here would turn the download button into a 404 the
 * moment the next release ships and before the site is redeployed.
 *
 * The bundler names its output `Cadence_<version>_x64-setup.exe`, which has a
 * version in it and so cannot be linked to from here. The release workflow
 * uploads a second copy under this stable name for exactly that reason; if the
 * button ever 404s, that upload step is the thing to look at.
 */
export const INSTALLER_URL = `${REPO}/releases/latest/download/Cadence-Setup.exe`;

/** Rounded, and only ever a claim about the order of magnitude. */
export const INSTALLER_SIZE = '3.4 MB';
