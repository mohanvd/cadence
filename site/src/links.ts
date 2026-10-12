/**
 * The repository: the source, and the releases the installers are attached to.
 *
 * For a while these were two repositories, a private one for the source and a
 * public one that held nothing but the built files. They are one again. The
 * download and the updater never noticed, because neither is addressed here:
 * see `INSTALLER_URL` below.
 */
const REPO_PATH = 'mohanvd/cadence';
const REPO = `https://github.com/${REPO_PATH}`;

export const REPO_URL = REPO;
export const RELEASES_URL = `${REPO}/releases`;
export const CHANGELOG_URL = `${REPO}/blob/main/CHANGELOG.md`;
export const ISSUES_URL = `${REPO}/issues/new/choose`;
export const SECURITY_URL = `${REPO}/security/policy`;
export const BRAND_URL = `${REPO}/tree/main/brand`;
export const LICENCE_URL = `${REPO}/blob/main/LICENSE`;
export const CONTACT_EMAIL = 'cadence@auva.dev';
export const CONTACT_URL = `mailto:${CONTACT_EMAIL}`;

/**
 * The name the release workflow gives the installer, on top of the one the
 * bundler chose. Both the download link and the size below are addressed
 * through it, so neither can drift from the other.
 */
const INSTALLER_ASSET = 'Cadence-Setup.exe';

/**
 * The installer, addressed through this site rather than through whoever is
 * hosting the file this month.
 *
 * `/download` is a redirect defined in `vercel.json`, and the indirection is
 * the point. A link that names its host is a link that dies when the host
 * changes, which is precisely what happened to the first one: it pointed
 * into this repository, the repository went private for a while, and the
 * button broke. Pointing at our own domain means a move needs one line of
 * `vercel.json` changed and nothing else, no page rebuilt, no link reissued.
 *
 * Addressed through `releases/latest` at the other end rather than by version,
 * too: a built page is a static artifact that outlives the release it was
 * built beside, and naming a version here would 404 the moment the next
 * release shipped.
 *
 * The bundler names its output `Cadence_<version>_x64-setup.exe`, which has a
 * version in it and so cannot be linked to. The release workflow uploads a
 * second copy under the stable name below for exactly that reason; if the
 * button ever 404s, that upload step is the thing to look at.
 */
export const INSTALLER_URL = '/download';

/**
 * What the page claims the download costs when the real number cannot be had.
 *
 * Deliberately coarse. It is a stand-in for a measurement, and rounding it to
 * the nearest whole megabyte says so; a stale `45.4` would read as precision
 * the page no longer has. Worth revisiting whenever the installer changes size
 * by enough to move this digit.
 */
const INSTALLER_SIZE_FALLBACK = '47 MB';

interface ReleaseAsset {
  name?: string;
  size?: number;
}

interface Release {
  assets?: ReleaseAsset[];
}

/**
 * The size of the installer the download button points at, measured rather
 * than remembered.
 *
 * This used to be a constant, and the constant went stale: it read `3.4 MB`
 * long after bundling mpv had taken the installer past forty. Asking the
 * release API at build time means the number is as old as the last deployment
 * instead of as old as whoever edited it last.
 *
 * Every failure, offline, rate-limited (this asks anonymously, and a build
 * machine's address is shared), a release with no such asset, returns the
 * fallback rather than throwing. A landing page that cannot state its download
 * size to one decimal place is still a landing page; one that fails to build
 * is not.
 *
 * Mebibytes under a `MB` label, matching what Explorer will show once the file
 * lands, which is the only place a visitor will ever check this figure.
 */
export async function resolveInstallerSize(): Promise<string> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO_PATH}/releases/latest`,
      {
        headers: { accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return INSTALLER_SIZE_FALLBACK;

    const release = (await response.json()) as Release;
    const size = release.assets?.find(
      (asset) => asset.name === INSTALLER_ASSET,
    )?.size;
    if (!size) return INSTALLER_SIZE_FALLBACK;

    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  } catch {
    return INSTALLER_SIZE_FALLBACK;
  }
}
