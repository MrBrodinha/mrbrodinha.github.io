export default function MusicCredits() {
  return <p className="site-music-credits">
    Piano: <a href="https://github.com/sfzinstruments/SplendidGrandPiano">Splendid Grand / AKAI</a>
    <span aria-hidden="true"> · </span>Electric: <a href="https://github.com/sfzinstruments/GregSullivan.E-Pianos">Greg Sullivan / kinwie</a>
    <span aria-hidden="true"> · </span>Music box: <a href="https://github.com/gleitz/midi-js-soundfonts#soundfonts-available">FluidR3 / MIDI.js Soundfonts</a>
    {' '}(<a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>)
    <span aria-hidden="true"> · </span>via <a href="https://github.com/danigb/smplr">smplr</a>
  </p>;
}
