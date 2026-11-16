/** Original quiet street score; no samples, speech, recording or network. */
export function streetSoundSample(seconds: number, filteredNoise: number): number {
  const t = seconds % 12;
  const wind = filteredNoise * (.035 + .018 * Math.sin(t * Math.PI / 6));
  const traffic = Math.sin(t * 73 * Math.PI * 2) * (.002 + .001 * Math.sin(t * Math.PI / 3));
  const hornTime = t - 6.4;
  const horn = hornTime >= 0 && hornTime < .28
    ? (Math.sin(hornTime * 220 * Math.PI * 2) + Math.sin(hornTime * 293 * Math.PI * 2)) * .007 * Math.sin(hornTime / .28 * Math.PI) : 0;
  const birdTime = t - 9.8;
  const bird = birdTime >= 0 && birdTime < .18
    ? Math.sin(birdTime * (2400 + 700 * birdTime) * Math.PI * 2) * .004 * Math.sin(birdTime / .18 * Math.PI) : 0;
  // Taxi-rank whistle: two rising, breathy pulses, distinct from birds and alarms.
  const whistleTime = t - 3.1;
  const pulse = whistleTime >= 0 && whistleTime < .72
    ? Math.max(0, Math.sin(whistleTime * Math.PI / .34)) * Math.sin(Math.min(1, whistleTime / .72) * Math.PI) : 0;
  const whistle = Math.sin(whistleTime * (2350 + 90 * Math.sin(whistleTime * 21)) * Math.PI * 2) * pulse * .006;
  const generator = (Math.sin(t * 50 * Math.PI * 2) + .25 * Math.sin(t * 100 * Math.PI * 2))
    * (.0015 + .0003 * Math.sin(t * 7));
  // Quiet crew-radio key/squelch without sampled or simulated intelligible speech.
  const radioTime = t - 10.9;
  const radio = radioTime >= 0 && radioTime < .24
    ? filteredNoise * .025 * Math.sin(radioTime / .24 * Math.PI) : 0;
  return wind + traffic + horn + bird + whistle + generator + radio;
}
