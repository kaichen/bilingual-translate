import Header from '../../components/Header';
import Main from '../../components/Main';
import Footer from '../../components/Footer';
import '../../styles/theme.css';
import '../../components/popup-components.css';

export default function App() {
  return (
    <div className="bt-popup-shell">
      <header className="bt-popup-padding">
        <Header />
      </header>
      <main className="bt-popup-main bt-popup-padding">
        <Main />
      </main>
      <footer className="bt-popup-padding">
        <Footer />
      </footer>
    </div>
  );
}
