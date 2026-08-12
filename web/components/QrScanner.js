"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import jsQR from "jsqr";
import { Button } from "./ui";

// Camera + image-upload QR scanner. Calls onDecode(rawString) with the decoded QR text.
export default function QrScanner({ onDecode }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
    if (code) {
      stop();
      onDecode(code.data);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onDecode, stop]);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanning(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setError("Camera unavailable — use image upload instead.");
    }
  }

  function onFile(e) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height);
      const code = jsQR(data.data, data.width, data.height);
      if (code) onDecode(code.data);
      else setError("No QR code found in that image.");
    };
    img.src = URL.createObjectURL(file);
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
        <video ref={videoRef} className={`aspect-video w-full object-cover ${scanning ? "" : "hidden"}`} muted playsInline />
        {!scanning && (
          <div className="flex aspect-video w-full items-center justify-center text-sm text-slate-400">
            Camera preview
          </div>
        )}
        {scanning && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-40 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!scanning ? (
          <Button size="sm" onClick={startCamera}>Scan with camera</Button>
        ) : (
          <Button size="sm" variant="danger" onClick={stop}>Stop</Button>
        )}
        <label className="btn-secondary btn-sm cursor-pointer">
          Upload image
          <input type="file" accept="image/*" onChange={onFile} className="hidden" />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-amber-700">{error}</p>}
    </div>
  );
}
