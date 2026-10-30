#!/usr/bin/env py
"""Generate Tauri app icons for ArchResidenceBD"""

from PIL import Image, ImageDraw
import os

# Icon sizes
sizes = [
    (32, 32),
    (128, 128),
    (256, 256),  # 128x128@2x
]

output_dir = "src-tauri/icons"
os.makedirs(output_dir, exist_ok=True)

# Create a simple architectural icon: blue building silhouette
for size in sizes:
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Building shape
    margin = size[0] // 8
    building_width = size[0] - (margin * 2)
    building_height = size[1] - margin
    building_x = margin
    building_y = margin
    
    # Main building (dark blue)
    draw.rectangle(
        [building_x, building_y, building_x + building_width, building_y + building_height],
        fill="#1e40af",
        outline="#1e3a8a",
        width=max(1, size[0] // 64)
    )
    
    # Windows (3x3 grid)
    window_size = building_width // 5
    for row in range(3):
        for col in range(3):
            wx = building_x + margin + (col * (window_size + margin // 2))
            wy = building_y + margin + (row * (window_size + margin // 2))
            draw.rectangle(
                [wx, wy, wx + window_size, wy + window_size],
                fill="#93c5fd",
                outline="#60a5fa",
                width=max(1, size[0] // 128)
            )
    
    # Save PNG
    filename = f"{size[0]}x{size[1]}.png"
    img.save(os.path.join(output_dir, filename))
    print(f"Created {filename}")

# Create ICO (Windows icon)
ico_path = os.path.join(output_dir, "icon.ico")
with Image.open(os.path.join(output_dir, "32x32.png")) as img32:
    with Image.open(os.path.join(output_dir, "128x128.png")) as img128:
        with Image.open(os.path.join(output_dir, "256x256.png")) as img256:
            img32.save(
                ico_path,
                format="ICO",
                sizes=[(32, 32), (128, 128), (256, 256)]
            )
            print(f"Created icon.ico")

# Create ICNS (macOS icon) - simplified, just use 256x256
icns_path = os.path.join(output_dir, "icon.icns")
with Image.open(os.path.join(output_dir, "256x256.png")) as img:
    img.save(icns_path, format="ICNS")
    print(f"Created icon.icns")

print("Icon generation complete!")
