import { ExternalLink } from "lucide-react";

export function SiteSignature() {
  return (
    <footer className="site-signature" aria-label="Site credit">
      <a
        className="site-signature__link"
        href="https://abhishekmurthy.com"
        target="_blank"
        rel="noopener noreferrer"
        title="Open abhishekmurthy.com"
        aria-label="Built with love by Abhishek Murthy. Opens abhishekmurthy.com in a new tab."
      >
        <span>built with love</span>
        <span className="site-signature__heart" aria-hidden="true">
          ❤️
        </span>
        <span className="site-signature__name">by abhishekmurthy</span>
        <ExternalLink className="site-signature__icon" aria-hidden="true" />
      </a>
    </footer>
  );
}
