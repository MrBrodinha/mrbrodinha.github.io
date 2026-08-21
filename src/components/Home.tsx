import { Link } from 'react-router-dom';

function Home() {
  const handleRedirect = () => {
    window.location.href = '/CrazyWildlife/index.html';
  };

  return (
    <div>
      <h1 onClick={handleRedirect}>MrBrodinha</h1>
      <p>
        <Link to="/redbull">Open Red Bull Ratings</Link>
      </p>
    </div>
  );
}

export default Home;
