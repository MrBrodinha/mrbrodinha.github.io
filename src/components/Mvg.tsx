import { Link } from 'react-router-dom';

const members = [
  { name: 'G̴̩̙̈́̎͐͒̈́ǒ̴̱̳͚̺́́b̷̼̟̺̄̎́̈́̕l̵̬͙͈̳̱̂̀͠͝í̸̤̦͍̘ń̵̰ ̶̩͝͠Ḿ̵̢͓͕̥͕̆o̴͑́͑͜e̶̻̥̻̜̒͂̀d̴͚̯̟̳̑̂́ä̸͎̠́̊̽̏͘', href: 'https://deltarune.com/sighting/', color: '#e40303' },
  { name: 'MrBrodinha', href: '/', color: '#ff8c00', internal: true },
  { name: 'PeidosFTW', href: 'https://rabosgigantes.com', color: '#ffed00' },
  { name: 'Pereira ッ', href: 'https://pereira3.github.io/', color: '#38ffac' },
  { name: 'Quim', href: 'https://www.youtube.com/watch?v=Ec4YbVP9R-A', color: '#004cff' },
  { name: 'RICADINHO', href: 'https://ricadinho.com/', color: '#732982' },
];

function Mvg() {
  return (
    <main className="mvg-page">
      <a className="mvg-logo-link" href="https://github.com/mvg-lol" target="_blank" rel="noreferrer" aria-label="MVG on GitHub">
        <img className="mvg-logo" src="/mvg/MVG_bgr.png" alt="MVG" />
      </a>

      <div className="mvg-divider" />

      <nav className="mvg-members" aria-label="MVG members">
        {members.map((member) => (
          member.internal ? (
            <Link className="mvg-member" key={member.name} to={member.href} style={{ color: member.color }}>
              {member.name}
            </Link>
          ) : (
            <a className="mvg-member" key={member.name} href={member.href} style={{ color: member.color }} target="_blank" rel="noreferrer">
              {member.name}
            </a>
          )
        ))}
      </nav>
    </main>
  );
}

export default Mvg;
