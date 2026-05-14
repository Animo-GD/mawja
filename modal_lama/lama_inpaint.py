"""
Mawja Studio — LaMa Inpainting Service
Deploy with: modal deploy lama_inpaint.py
"""

import modal
import base64
import io

# ── Modal App ──────────────────────────────────────────────────────────────
app = modal.App("mawja-lama-inpaint")

# Docker image with all dependencies
docker_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "simple-lama-inpainting==0.1.2",
        "fastapi[standard]",
        "torch>=2.0.0",
        "torchvision>=0.15.0",
    )
)

# ── Inpainting Class (model is loaded once per container) ──────────────────
@app.cls(
    image=docker_image,
    gpu="T4",          # cheapest GPU (~$0.000306/sec), LaMa runs in 2-4s = ~$0.001
    timeout=120,
    scaledown_window=60,  # keep warm for 60s to avoid cold starts
)
class LamaInpainter:

    @modal.enter()
    def load_model(self):
        """Load LaMa model once when container starts."""
        from simple_lama_inpainting import SimpleLama
        print("Loading LaMa model...")
        self.model = SimpleLama()
        print("LaMa model loaded!")

    @modal.fastapi_endpoint(method="POST", docs=True)
    def inpaint(self, payload: dict) -> dict:
        """
        Accepts:
          {
            "image": "data:image/png;base64,...",   # Full canvas image
            "selection": { "x": int, "y": int, "width": int, "height": int }
          }

        Returns:
          { "image": "data:image/png;base64,..." }  # Cleaned image, same size
        """
        from PIL import Image, ImageDraw
        import numpy as np

        # ── 1. Decode the input image ──────────────────────────────────────
        image_b64 = payload.get("image", "")
        if "," in image_b64:
            image_b64 = image_b64.split(",")[1]

        image_bytes = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = image.size

        # ── 2. Build mask from selection rectangle ─────────────────────────
        sel = payload.get("selection", {})
        x = max(0, int(sel.get("x", 0)))
        y = max(0, int(sel.get("y", 0)))
        sw = min(int(sel.get("width", 100)), w - x)
        sh = min(int(sel.get("height", 100)), h - y)

        # Add a small feather/padding to the mask for better blending
        padding = max(4, min(sw, sh) // 20)
        mx = max(0, x - padding)
        my = max(0, y - padding)
        mx2 = min(w, x + sw + padding)
        my2 = min(h, y + sh + padding)

        mask = Image.new("L", (w, h), 0)   # Black = keep
        draw = ImageDraw.Draw(mask)
        draw.rectangle([mx, my, mx2, my2], fill=255)  # White = inpaint

        # ── 3. Run LaMa inpainting ─────────────────────────────────────────
        result = self.model(image, mask)

        # ── 4. Return as base64 PNG ────────────────────────────────────────
        buf = io.BytesIO()
        result.save(buf, format="PNG", optimize=False)
        result_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        return {"image": f"data:image/png;base64,{result_b64}"}
