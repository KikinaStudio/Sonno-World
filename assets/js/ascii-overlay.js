(function (global) {
  const CHARSET = ' .:-=+*#%@';
  const DEFAULTS = {
    color: '#3AA0FF',
    fontSize: 16,
    density: 8,
    invert: false,
    showVideo: false,
    autostart: false
  };

  function clampDensity(value) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : DEFAULTS.density;
  }

  function toCharArray(invert) {
    const chars = CHARSET.split('');
    return invert ? chars.reverse() : chars;
  }

  function ensureVideoStream(video, config, remember) {
    if (!config.autostart || video.srcObject) return Promise.resolve();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.resolve();
    }
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (!video.srcObject) {
          video.srcObject = stream;
          if (remember) remember(stream);
        } else {
          stream.getTracks().forEach(track => track.stop());
        }
      })
      .catch(() => undefined);
  }

  function attachAsciiToVideo(video, options) {
    if (!(video instanceof HTMLVideoElement)) {
      throw new TypeError('attachAsciiToVideo expects a HTMLVideoElement.');
    }

    if (video.__asciiOverlayInstance) {
      if (options) {
        video.__asciiOverlayInstance.setOptions(options);
      }
      return video.__asciiOverlayInstance;
    }

    const config = Object.assign({}, DEFAULTS, options || {});
    config.density = clampDensity(config.density);
    const canvas = document.createElement('canvas');
    canvas.className = (video.id || 'video') + '-ascii-overlay';
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '0'
    });

    video.insertAdjacentElement('afterend', canvas);

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const sampleCanvas = document.createElement('canvas');
    const sampleCtx = sampleCanvas.getContext('2d');

    let dims = null;
    let rafId = null;
    let running = true;
    let charSequence = toCharArray(config.invert);
    let charCount = charSequence.length;
    let charWidth = 0;
    let charHeight = config.fontSize;
    let managedStream = null;

    const originalOpacity = video.style.opacity;
    const originalVisibility = video.style.visibility;

    function updateFontMetrics() {
      ctx.save();
      ctx.font = `${config.fontSize}px monospace`;
      ctx.textBaseline = 'top';
      const metrics = ctx.measureText('M');
      charWidth = metrics.width || config.fontSize * 0.6;
      charHeight = config.fontSize;
      ctx.restore();
    }

    function updateCharSequence() {
      charSequence = toCharArray(config.invert);
      charCount = charSequence.length;
    }

    function updateVideoVisibility() {
      video.style.opacity = config.showVideo ? originalOpacity : '0';
      video.style.visibility = originalVisibility;
    }

    function updateDimensions() {
      const width = video.videoWidth || video.clientWidth;
      const height = video.videoHeight || video.clientHeight;
      if (!width || !height) {
        dims = null;
        return;
      }
      canvas.width = width;
      canvas.height = height;
      const cols = Math.max(1, Math.floor(width / config.density));
      const rows = Math.max(1, Math.floor(height / config.density));
      sampleCanvas.width = cols;
      sampleCanvas.height = rows;
      dims = {
        width,
        height,
        cols,
        rows,
        cellWidth: width / cols,
        cellHeight: height / rows
      };
    }

    function render() {
      if (!running) return;

      if (!video.videoWidth || !video.videoHeight) {
        rafId = requestAnimationFrame(render);
        return;
      }

      if (!dims || dims.width !== video.videoWidth || dims.height !== video.videoHeight) {
        updateDimensions();
        if (!dims) {
          rafId = requestAnimationFrame(render);
          return;
        }
      }

      const { cols, rows } = dims;
      sampleCtx.drawImage(video, 0, 0, cols, rows);
      const imageData = sampleCtx.getImageData(0, 0, cols, rows).data;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!config.showVideo) {
        ctx.fillStyle = config.invert ? '#f5f5f5' : '#05070c';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.save();
      const scaleX = dims.cellWidth / charWidth;
      const scaleY = dims.cellHeight / charHeight;
      ctx.scale(scaleX, scaleY);
      ctx.font = `${config.fontSize}px monospace`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = config.color;

      for (let y = 0; y < rows; y += 1) {
        const yOffset = y * charHeight;
        for (let x = 0; x < cols; x += 1) {
          const idx = (y * cols + x) * 4;
          const r = imageData[idx];
          const g = imageData[idx + 1];
          const b = imageData[idx + 2];
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const charIndex = Math.min(charCount - 1, Math.round((luminance / 255) * (charCount - 1)));
          ctx.fillText(charSequence[charIndex], x * charWidth, yOffset);
        }
      }
      ctx.restore();

      rafId = requestAnimationFrame(render);
    }

    function handleResize() {
      updateDimensions();
    }

    updateCharSequence();
    updateFontMetrics();
    updateVideoVisibility();

    function rememberStream(stream) {
      managedStream = stream;
    }

    ensureVideoStream(video, config, rememberStream).finally(() => {
      updateDimensions();
      if (!rafId) {
        rafId = requestAnimationFrame(render);
      }
    });

    video.addEventListener('loadedmetadata', updateDimensions);
    video.addEventListener('loadeddata', updateDimensions);
    window.addEventListener('resize', handleResize);

    const api = {
      canvas,
      setOptions(newOptions) {
        if (!newOptions) return api;
        if (typeof newOptions.color === 'string') {
          config.color = newOptions.color;
        }
        if (typeof newOptions.fontSize === 'number') {
          config.fontSize = newOptions.fontSize;
        }
        if (typeof newOptions.density === 'number') {
          config.density = clampDensity(newOptions.density);
        }
        if (typeof newOptions.invert === 'boolean') {
          config.invert = newOptions.invert;
        }
        if (typeof newOptions.showVideo === 'boolean') {
          config.showVideo = newOptions.showVideo;
        }
        if (typeof newOptions.autostart === 'boolean') {
          config.autostart = newOptions.autostart;
        }

        updateCharSequence();
        updateFontMetrics();
        updateVideoVisibility();
        updateDimensions();
        return api;
      },
      destroy() {
        running = false;
        cancelAnimationFrame(rafId);
        window.removeEventListener('resize', handleResize);
        video.removeEventListener('loadedmetadata', updateDimensions);
        video.removeEventListener('loadeddata', updateDimensions);
        canvas.remove();
        video.style.opacity = originalOpacity;
        video.style.visibility = originalVisibility;
        if (managedStream) {
          managedStream.getTracks().forEach(track => track.stop());
          managedStream = null;
        }
        sampleCanvas.width = sampleCanvas.height = 0;
        delete video.__asciiOverlayInstance;
      }
    };

    video.__asciiOverlayInstance = api;
    return api;
  }

  global.attachAsciiToVideo = attachAsciiToVideo;
  if (global && typeof global.dispatchEvent === 'function') {
    try {
      global.dispatchEvent(new Event('ascii-overlay-ready'));
    } catch (err) {
      if (global.document && typeof global.document.createEvent === 'function') {
        const legacyEvent = global.document.createEvent('Event');
        legacyEvent.initEvent('ascii-overlay-ready', true, true);
        global.dispatchEvent(legacyEvent);
      }
    }
  }
})(typeof window !== 'undefined' ? window : this);
