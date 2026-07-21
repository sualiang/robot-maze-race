#!/usr/bin/env python3
"""
Generate 20 iron-armored robot dog avatar PNGs (256x256, transparent background).
Each avatar is unique - different colors, armor styles, and gender-coded designs.
"""

import os
from PIL import Image, ImageDraw

OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "packages", "web", "public", "avatars"
)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Colors for 20 distinct avatars
COLORS = [
    # (primary, secondary, eye_color, accent) - male-coded tough
    ("#D32F2F", "#B71C1C", "#00E5FF", "#FFC107"),  # Red/cyan eyes
    ("#1565C0", "#0D47A1", "#FF1744", "#00E5FF"),  # Blue/red eyes
    ("#2E7D32", "#1B5E20", "#FFEA00", "#00E5FF"),  # Green/yellow eyes
    ("#F57F17", "#E65100", "#00E5FF", "#FFFFFF"),  # Orange/cyan eyes  
    ("#6A1B9A", "#4A148C", "#00FF88", "#FFD600"),  # Purple/green eyes
    ("#37474F", "#212121", "#FF3D00", "#00E5FF"),  # Dark gray/orange eyes
    ("#00796B", "#004D40", "#FF9100", "#FFEA00"),  # Teal/orange eyes
    ("#F44336", "#C62828", "#76FF03", "#FFFFFF"),  # Crimson/lime eyes
    ("#1E88E5", "#0D47A1", "#FF6D00", "#76FF03"),  # Royal blue/amber eyes
    ("#E65100", "#BF360C", "#00E676", "#FFEA00"),  # Deep orange/green eyes
    # Pastel/bright - female-coded friendly
    ("#FF80AB", "#F06292", "#00B8D4", "#FFFFFF"),  # Pink/cyan eyes
    ("#B388FF", "#7C4DFF", "#FF4081", "#FFD600"),  # Purple/pink eyes
    ("#82B1FF", "#448AFF", "#FF80AB", "#FFFFFF"),  # Light blue/pink eyes
    ("#B9F6CA", "#69F0AE", "#FF4081", "#448AFF"),  # Mint/pink eyes
    ("#FFE57F", "#FFD740", "#448AFF", "#FF4081"),  # Gold/blue eyes
    ("#A5D6A7", "#66BB6A", "#D500F9", "#FFFFFF"),  # Sage/purple eyes
    ("#FFCC80", "#FFAB40", "#00C853", "#2979FF"),  # Peach/green eyes
    ("#CE93D8", "#AB47BC", "#00E5FF", "#FFFFFF"),  # Lavender/cyan eyes
    ("#80DEEA", "#26C6DA", "#D500F9", "#FF6D00"),  # Aqua/purple eyes
    ("#F48FB1", "#EC407A", "#00E676", "#2979FF"),  # Rose/green eyes
]

# Gender mapping (first 10 male/tough, last 10 female/friendly)
GENDERS = ["male"] * 10 + ["female"] * 10

def draw_robot_dog_head(draw, size, colors, gender):
    """Draw a robot dog head avatar at the given size."""
    pw, pe, ea, ac = colors  # primary, edge, eye_accents, accent
    cx, cy = size // 2, size // 2
    r = size // 2 - 4  # head radius
    
    # ---- Base head shape (circular with jaw) ----
    # Main head circle
    draw.ellipse([cx - r, cy - r + 2, cx + r, cy + r + 2], fill=pw, outline=pe, width=3)
    
    # ---- Jaw/chin extension ----
    jaw_w = r * 0.7
    jaw_h = r * 0.4
    jaw_y = cy + r * 0.3
    draw.rounded_rectangle(
        [cx - jaw_w, jaw_y, cx + jaw_w, jaw_y + jaw_h],
        radius=int(jaw_h * 0.5), fill=pe, outline=pe, width=2
    )
    
    # ---- Ear/antennae (armored plates on top) ----
    ear_color = ac if gender == "female" else pe
    # Left ear plate
    draw.polygon([
        (cx - r * 0.7, cy - r * 0.3),
        (cx - r * 0.85, cy - r * 0.85),
        (cx - r * 0.95, cy - r * 0.6),
        (cx - r * 0.6, cy - r * 0.2)
    ], fill=ear_color, outline=pe, width=2)
    # Right ear plate  
    draw.polygon([
        (cx + r * 0.7, cy - r * 0.3),
        (cx + r * 0.85, cy - r * 0.85),
        (cx + r * 0.95, cy - r * 0.6),
        (cx + r * 0.6, cy - r * 0.2)
    ], fill=ear_color, outline=pe, width=2)
    
    # ---- Armor plates on head ----
    # Top center armor plate
    plate_y = cy - r * 0.4
    draw.arc([cx - r * 0.5, plate_y - r * 0.3, cx + r * 0.5, plate_y + r * 0.3], 
             180, 0, fill=ac, width=3)
    
    # Forehead emblem/visor
    visor_y = cy - r * 0.35
    visor_w = r * 0.35
    draw.rounded_rectangle(
        [cx - visor_w, visor_y - 2, cx + visor_w, visor_y + 3],
        radius=2, fill=ea, outline=None
    )
    
    # ---- Eyes (glowing) ----
    eye_y = cy - r * 0.08
    eye_spacing = r * 0.3
    eye_r = r * 0.12
    
    # Eye glow
    for ox in [-1, 1]:
        draw.ellipse(
            [cx + ox * eye_spacing - eye_r * 1.6, eye_y - eye_r * 1.6,
             cx + ox * eye_spacing + eye_r * 1.6, eye_y + eye_r * 1.6],
            fill=ea, outline=None
        )
    
    # Eye shape - male = angular, female = rounder
    for ox in [-1, 1]:
        ex, ey = cx + ox * eye_spacing, eye_y
        if gender == "male":
            # Angular/hexagonal eyes
            draw.polygon([
                (ex - eye_r * 0.8, ey - eye_r * 0.6),
                (ex - eye_r * 0.3, ey - eye_r * 0.9),
                (ex + eye_r * 0.3, ey - eye_r * 0.9),
                (ex + eye_r * 0.8, ey - eye_r * 0.6),
                (ex + eye_r * 0.6, ey + eye_r * 0.5),
                (ex - eye_r * 0.6, ey + eye_r * 0.5)
            ], fill=ea, outline="#FFFFFF", width=1)
            # Pupil
            draw.ellipse(
                [ex - eye_r * 0.25 + ox * 2, ey - eye_r * 0.2,
                 ex + eye_r * 0.25 + ox * 2, ey + eye_r * 0.3],
                fill="#FFFFFF", outline=None
            )
        else:
            # Round/cute eyes
            draw.ellipse(
                [ex - eye_r, ey - eye_r * 0.8, ex + eye_r, ey + eye_r * 0.8],
                fill=ea, outline="#FFFFFF", width=1
            )
            # Pupil (larger, cuter)
            draw.ellipse(
                [ex - eye_r * 0.35 + ox * 2, ey - eye_r * 0.2,
                 ex + eye_r * 0.35 + ox * 2, ey + eye_r * 0.3],
                fill="#FFFFFF", outline=None
            )
            # Eyelashes
            for lx in [-0.6, -0.3, 0, 0.3, 0.6] if ox == -1 else [0.6, 0.3, 0, -0.3, -0.6]:
                draw.arc([ex - eye_r * 0.9 + lx * eye_r * 0.3, ey - eye_r * 1.3,
                         ex + eye_r * 0.9 + lx * eye_r * 0.3, ey + eye_r * 0.1],
                         0, 180 if ox == -1 else 0, fill="#FFFFFF", width=1)
    
    # ---- Snout/muzzle (robotic) ----
    snout_y = cy + r * 0.18
    snout_w = r * 0.25
    snout_h = r * 0.2
    
    # Snout box
    draw.rounded_rectangle(
        [cx - snout_w, snout_y - snout_h * 0.3, cx + snout_w, snout_y + snout_h],
        radius=4, fill=pe if gender == "male" else ac, outline=pe, width=2
    )
    
    # Nose
    draw.ellipse(
        [cx - 4, snout_y - 2, cx + 4, snout_y + 4],
        fill=pe, outline=ea, width=1
    )
    
    # Mouth (grille/vents)
    if gender == "male":
        # Grille/vent mouth - tough look
        for i in range(3):
            my = snout_y + snout_h * 0.3 + i * 5
            draw.line([cx - snout_w * 0.6, my, cx + snout_w * 0.6, my], 
                     fill=pe, width=1)
    else:
        # Small smile - friendly look
        draw.arc([cx - snout_w * 0.5, snout_y, cx + snout_w * 0.5, snout_y + snout_h * 0.6],
                 10, 170, fill=pe, width=1)
        # Small cheek blush
        for b_ox in [-1, 1]:
            draw.ellipse(
                [cx + b_ox * snout_w * 1.5 - 3, snout_y + snout_h * 0.2,
                 cx + b_ox * snout_w * 1.5 + 3, snout_y + snout_h * 0.5],
                fill="#FF80AB" if gender == "female" else "#FF6D00",
                outline=None
            )
    
    # ---- Neck/body connector ----
    neck_w = r * 0.5
    neck_y = cy + r * 0.75
    draw.rounded_rectangle(
        [cx - neck_w, neck_y, cx + neck_w, neck_y + r * 0.25],
        radius=int(r * 0.1), fill=pe, outline=pw, width=2
    )
    
    # ---- Rivets/details (male: more rivets/bolts, female: decorative dots) ----
    if gender == "male":
        rivet_positions = [
            (-r * 0.75, cy - r * 0.55), (r * 0.75, cy - r * 0.55),
            (-r * 0.75, cy + r * 0.15), (r * 0.75, cy + r * 0.15),
            (-r * 0.35, cy + r * 0.65), (r * 0.35, cy + r * 0.65)
        ]
        for rx, ry in rivet_positions:
            draw.ellipse([rx - 2, ry - 2, rx + 2, ry + 2], fill=ea, outline=pe, width=1)
    else:
        # Decorative pattern - triangle/diamond on forehead
        draw.polygon([
            (cx, cy - r * 0.5),
            (cx - 5, cy - r * 0.35),
            (cx + 5, cy - r * 0.35)
        ], fill=ea, outline="#FFFFFF", width=1)


def main():
    for idx in range(20):
        size = 256
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        colors = COLORS[idx]
        gender = GENDERS[idx]
        
        draw_robot_dog_head(draw, size, colors, gender)
        
        filename = f"dog-{idx+1:02d}.png"
        filepath = os.path.join(OUTPUT_DIR, filename)
        img.save(filepath, "PNG")
        print(f"✅ Saved {filepath} ({gender}, colors={colors[0]}/{colors[1]})")
    
    print(f"\n🎉 All 20 avatars generated in {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
