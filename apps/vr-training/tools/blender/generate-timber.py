"""Original Culltron fine laminated timber colour and Cycles-bake height source.

Artwork: Culltron, CC0 1.0. Grain follows texture U / desktop world X.
Run from apps/vr-training: python3 tools/blender/generate-timber.py
The matching bake-timber.py imports the same deterministic height generator.
"""
from pathlib import Path
import numpy as np

OUT = Path(__file__).resolve().parents[2] / 'artifacts' / 'hero-build'
SIZE = 1024
SEED = 816041
MAX_RELIEF_METRES = 0.000030


def smooth_noise(rng, shape, sigma_u, sigma_v):
    """Periodic, band-limited noise: smooth fibres without coarse pixels."""
    white = rng.normal(size=shape)
    fv = np.fft.fftfreq(shape[0])[:, None]
    fu = np.fft.rfftfreq(shape[1])[None, :]
    kernel = np.exp(-2 * np.pi**2 * (sigma_u**2 * fu**2 + sigma_v**2 * fv**2))
    field = np.fft.irfft2(np.fft.rfft2(white) * kernel, s=shape)
    return field / max(float(field.std()), 1e-8)


def timber_fields(size=SIZE):
    """Return restrained sRGB colour and authored normalized physical height.

    Relief stays within 30 micrometres peak-to-peak. Broad colour changes carry
    no raised ridges; the finished worktop is sanded and gently worn.
    """
    rng = np.random.default_rng(SEED)
    shape = (size, size)
    scale = size / SIZE
    # Fine 1–3 pixel fibres, strongly elongated along U, never broad sine waves.
    fine = smooth_noise(rng, shape, 36 * scale, .8 * scale)
    pores = smooth_noise(rng, shape, 14 * scale, .42 * scale)
    ribbons = smooth_noise(rng, shape, 110 * scale, 1.8 * scale)
    mottling = smooth_noise(rng, shape, 95 * scale, 20 * scale)
    tone = 1.8 * fine + .65 * pores + .7 * ribbons + .65 * mottling
    # Nine narrow glued laminations: faint tone differences, almost flush seams.
    plank_edges = np.rint(np.linspace(0, size, 10)).astype(int)
    offsets = rng.uniform(-1.25, 1.25, 9)
    for plank in range(9):
        tone[plank_edges[plank]:plank_edges[plank + 1]] += offsets[plank]
    for edge in plank_edges[1:-1]:
        tone[max(0, edge - 1):min(size, edge + 1)] -= 1.1
    # Quiet interrupted pores: long fine marks, no dark knots or coarse stripes.
    marks = np.zeros(shape, dtype=float)
    for _ in range(220):
        u = int(rng.integers(0, size))
        v = int(rng.integers(0, size))
        length = int(rng.integers(max(2, int(9 * scale)), max(3, int(60 * scale))))
        marks[v, u:min(size, u + length + 1)] = float(rng.integers(-9, 4))
    fv = np.fft.fftfreq(size)[:, None]
    fu = np.fft.rfftfreq(size)[None, :]
    soft_marks = np.exp(-2 * np.pi**2 * (.45 * scale)**2 * (fu**2 + fv**2))
    marks = np.fft.irfft2(np.fft.rfft2(marks) * soft_marks, s=shape)
    tone += marks * .32
    # Light abrasion and dust have sub-visible colour amplitude, with no speckle.
    abrasion = smooth_noise(rng, shape, 18 * scale, 8 * scale)
    tone += abrasion * .18
    tone = np.clip(tone, -7, 7)
    warm_muted = np.array((182., 141., 97.))  # #b68d61, unlit sRGB target
    colour = np.clip(warm_muted + tone[..., None] * np.array((1., .92, .80)), 0, 255)
    # Smooth normal source: only fibres and very gentle pores contribute relief.
    height = .50 + .36 * fine + .10 * pores + .025 * ribbons + marks * .006
    height = np.clip(height, 0., 1.).astype(np.float32)
    return np.rint(colour).astype(np.uint8), height


def main():
    from PIL import Image
    OUT.mkdir(parents=True, exist_ok=True)
    colour, _ = timber_fields()
    target = OUT / 'hero-timber-color.png'
    Image.fromarray(colour, 'RGB').save(target, optimize=True)
    print(f'Generated original fine timber: {target} ({SIZE}×{SIZE}; grain U)')


if __name__ == '__main__':
    main()
