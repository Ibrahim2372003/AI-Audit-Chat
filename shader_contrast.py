def hex_to_rgb01(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))

def luminance01(rgb):
    def chan(c):
        return c/12.92 if c <= 0.03928 else ((c+0.055)/1.055) ** 2.4
    r, g, b = rgb
    return 0.2126*chan(r) + 0.7152*chan(g) + 0.0722*chan(b)

def ratio(rgb_fg, rgb_bg):
    l1, l2 = luminance01(rgb_fg), luminance01(rgb_bg)
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)

text_color = hex_to_rgb01("#E7E9EE")

# Brightest palette color the shader ever mixes toward (the green accent —
# the brightest of the three palette stops used).
brightest = hex_to_rgb01("#4FD1A5")

print("Finding the scrim multiplier k such that even the brightest possible")
print("shader output, scaled by k, still passes 4.5:1 against the headline text.\n")
print(f"{'k':>5} {'scaled bg luminance':>20} {'ratio vs text':>15} {'result':>8}")
for k100 in range(50, 0, -2):
    k = k100 / 100
    scaled_bg = tuple(c * k for c in brightest)
    r = ratio(text_color, scaled_bg)
    print(f"{k:5.2f} {luminance01(scaled_bg):20.4f} {r:15.2f} {'PASS' if r>=4.5 else 'fail':>8}")
