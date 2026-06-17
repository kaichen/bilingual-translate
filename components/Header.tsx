import './popup-components.css';

const version = process.env.APP_VERSION;

export default function Header() {
  return (
    <h1 className="bt-popup-title">
      bilingual translate <span className="bt-popup-version">V{version}</span>
    </h1>
  );
}
