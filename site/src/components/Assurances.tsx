import { BadgeCheck, KeyRound, RefreshCw, WifiOff } from './icons';

/**
 * The things a player has to promise before anyone lets it near their files.
 *
 * Stated plainly and near the second download prompt, because they are the
 * objections that stop an install: where the files go, what it talks to, what
 * it costs, and what happens the next time it changes.
 *
 * This section used to promise MIT, which stopped being true at 0.7.0. The
 * source is public again and the licence is still not an open-source one, so
 * the last claim says proprietary and means it. A trust section that is out of
 * date is worse than no trust section: it is the page being wrong about the
 * one subject it exists to be trusted on.
 *
 * Everything below is checkable against `LICENSE` and the updater, and none of
 * it should be edited without checking there first.
 */
const CLAIMS = [
  {
    icon: WifiOff,
    title: 'Your files stay on your disk',
    body: 'Cadence reads a file from where it already is. Nothing is uploaded, copied to a service, or sent anywhere at all, and nothing about how you use it is measured or reported.',
  },
  {
    icon: KeyRound,
    title: 'No account, nothing to sign in to',
    body: 'There is no sign-up, no licence key and no activation step. You download an installer, run it without administrator rights, and it opens.',
  },
  {
    icon: RefreshCw,
    title: 'Updates are signed and quiet',
    body: 'A new version is verified against a key built into the app, downloaded in the background, and applied when you restart. Never mid-film.',
  },
  {
    icon: BadgeCheck,
    title: 'Free, on every machine you own',
    body: 'Personal or commercial, any number of devices, no charge. Cadence itself is proprietary; the components it is built on are not, and they keep their own terms.',
  },
];

export default function Assurances() {
  return (
    <section className="xn-section">
      <header className="xn-section__head rise">
        <p className="xn-section__eyebrow">The deal</p>
        <h2 className="xn-section__title">No catch, and here is what that means</h2>
      </header>

      <ul className="ld-claims">
        {CLAIMS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="ld-claim rise">
            <span className="ld-claim__icon">
              <Icon size={16} strokeWidth={1.6} aria-hidden />
            </span>
            <h3 className="ld-claim__title">{title}</h3>
            <p className="ld-claim__body">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
