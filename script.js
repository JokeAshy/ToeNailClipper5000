(() => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // UI Elements
  const clippedCountEl = document.getElementById("clippedCount");
  const comboCountEl = document.getElementById("comboCount");
  const scoreCountEl = document.getElementById("scoreCount");
  const timeLeftEl = document.getElementById("timeLeft");
  const progressFillEl = document.getElementById("progressFill");
  const progressPercentEl = document.getElementById("progressPercent");

  const menuOverlay = document.getElementById("menuOverlay");
  const modalTag = document.getElementById("modalTag");
  const modalTitle = document.getElementById("modalTitle");
  const modalDesc = document.getElementById("modalDesc");
  const finalStats = document.getElementById("finalStats");
  const finalScoreEl = document.getElementById("finalScore");
  const finalClippedEl = document.getElementById("finalClipped");
  const finalComboEl = document.getElementById("finalCombo");

  const startBtn = document.getElementById("startBtn");
  const resetBtn = document.getElementById("resetBtn");
  const soundToggleBtn = document.getElementById("soundToggleBtn");

  // Game Constants
  const TARGET_NAILS = 500;
  const INITIAL_TIME = 60.0;
  const TOE_COUNT = 5;

  // Game State
  let isPlaying = false;
  let soundEnabled = true;
  let clippedNails = 0;
  let score = 0;
  let combo = 1;
  let maxCombo = 1;
  let timeLeft = INITIAL_TIME;
  let lastTimestamp = 0;
  let screenShake = 0;

  const backgroundMusic = new Audio("nagila-hava-8bit.ogg");
  backgroundMusic.loop = true;
  backgroundMusic.volume = 0.45;

  function syncMusic() {
    if (!backgroundMusic) return;
    backgroundMusic.muted = !soundEnabled;

    if (isPlaying && soundEnabled) {
      backgroundMusic.play().catch(() => {});
      return;
    }

    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;
  }

  // Clipper Cursor State
  const clipper = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    snapAnim: 0
  };

  // Entities
  let toes = [];
  let clippings = [];
  let floatingTexts = [];

  const starOfDavidImage = new Image();
  starOfDavidImage.src = "star-of-david-large.png";

  // Web Audio Synthesizer for Crisp Snip & Feedback SFX
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function playSound(type) {
    if (!soundEnabled) return;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === "snip") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.07);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === "armor") {
      osc.type = "square";
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.09);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === "golden") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.07);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === "ouch") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(170, now);
      osc.frequency.linearRampToValueAtTime(95, now + 0.2);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    }
  }

  // Toe & Nail Setup
  function initToes() {
    toes = [];
    const widths = [88, 72, 66, 62, 54];
    const heights = [195, 180, 168, 155, 138];
    const spacing = 148;
    const startX = (canvas.width - spacing * (TOE_COUNT - 1)) / 2;

    for (let i = 0; i < TOE_COUNT; i++) {
      const toe = {
        index: i,
        x: startX + i * spacing,
        baseY: canvas.height + 20,
        width: widths[i],
        height: heights[i],
        winceTimer: 0,
        nail: null
      };
      spawnNail(toe);
      toes.push(toe);
    }
  }

  function spawnNail(toe) {
    const roll = Math.random();
    let type = "standard";
    let maxHp = 1;
    let growSpeed = 28 + Math.random() * 18;

    if (roll > 0.88) {
      type = "golden";
      growSpeed = 40;
    } else if (roll > 0.72) {
      type = "turbo";
      growSpeed = 62;
    } else if (roll > 0.54) {
      type = "armored";
      maxHp = 2;
      growSpeed = 24;
    }

    toe.nail = {
      type,
      hp: maxHp,
      maxHp,
      length: 14 + Math.random() * 14,
      maxLength: 92,
      growSpeed,
      targetMin: 24,
      targetMax: 68
    };
  }

  // Floating Text & Flying Nail Clippings
  function addFloatingText(x, y, text, color) {
    floatingTexts.push({
      x,
      y,
      text,
      color,
      alpha: 1,
      vy: -65
    });
  }

  function spawnClipping(x, y, width, type) {
    const colors = {
      standard: "#f8fafc",
      armored: "#cbd5e1",
      turbo: "#bae6fd",
      golden: "#fde047"
    };
    clippings.push({
      x,
      y,
      width: width * 0.72,
      height: 12,
      vx: (Math.random() - 0.5) * 320,
      vy: -240 - Math.random() * 140,
      rot: (Math.random() - 0.5) * 0.5,
      vRot: (Math.random() - 0.5) * 12,
      color: colors[type] || "#f8fafc"
    });
  }

  // Clipping Action Logic
  function attemptClip() {
    if (!isPlaying) return;
    clipper.snapAnim = 1;

    let hitSomething = false;

    for (const toe of toes) {
      const nail = toe.nail;
      const nailBedTopY = toe.baseY - toe.height + 22;
      const nailTipY = nailBedTopY - nail.length;
      const greenTopY = nailBedTopY - nail.targetMax;
      const greenBottomY = nailBedTopY - nail.targetMin;

      const withinX = Math.abs(clipper.x - toe.x) <= toe.width * 0.48;
      if (!withinX) continue;

      // Check if blade is in the safe trim zone
      if (
        clipper.y >= Math.min(nailTipY - 12, greenTopY) &&
        clipper.y <= greenBottomY &&
        nail.length >= nail.targetMin
      ) {
        hitSomething = true;
        nail.hp -= 1;

        if (nail.hp > 0) {
          playSound("armor");
          screenShake = 5;
          addFloatingText(toe.x, clipper.y - 12, "CRACK! (1 LEFT)", "#cbd5e1");
        } else {
          // Successful Nail Snip!
          const isGolden = nail.type === "golden";
          const isTurbo = nail.type === "turbo";
          const bonusNails = isGolden ? 5 : 1;

          clippedNails = Math.min(TARGET_NAILS, clippedNails + bonusNails);
          const basePts = isGolden ? 100 : isTurbo ? 30 : nail.type === "armored" ? 25 : 10;
          const gained = basePts * combo;
          score += gained;

          combo += 1;
          if (combo > maxCombo) maxCombo = combo;

          if (isGolden) {
            timeLeft = Math.min(99, timeLeft + 3.0);
            playSound("golden");
            addFloatingText(toe.x, clipper.y - 20, `GOLDEN! +${gained} & +3s`, "#ffd166");
          } else {
            playSound("snip");
            addFloatingText(toe.x, clipper.y - 16, `+${gained}`, "#06d6a0");
          }

          screenShake = 6;
          spawnClipping(toe.x, clipper.y, toe.width, nail.type);
          spawnNail(toe);

          if (clippedNails >= TARGET_NAILS) {
            endGame(true);
            return;
          }
        }
        break;
      } else if (clipper.y > greenBottomY && clipper.y <= nailBedTopY + 35) {
        // OUCH! Clipped too deep into the pink nail bed
        hitSomething = true;
        playSound("ouch");
        combo = 1;
        toe.winceTimer = 0.55;
        screenShake = 14;
        timeLeft = Math.max(0, timeLeft - 2.0);
        addFloatingText(toe.x, clipper.y - 12, "OUCH! -2.0s", "#ff4d8d");
        break;
      }
    }

    if (!hitSomething) {
      // Snipped empty air
      playSound("snip");
      if (combo > 1) {
        combo = 1;
        addFloatingText(clipper.x, clipper.y - 15, "MISS! COMBO RESET", "#94a3b8");
      }
    }

    updateHUD();
  }

  // Update Game Loop
  function update(dt) {
    if (!isPlaying) return;

    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateHUD();
      endGame(false);
      return;
    }

    if (clipper.snapAnim > 0) {
      clipper.snapAnim = Math.max(0, clipper.snapAnim - dt * 8);
    }

    if (screenShake > 0) {
      screenShake = Math.max(0, screenShake - dt * 35);
    }

    // Grow nails continuously
    for (const toe of toes) {
      if (toe.winceTimer > 0) {
        toe.winceTimer = Math.max(0, toe.winceTimer - dt);
      }
      const nail = toe.nail;
      if (nail.length < nail.maxLength) {
        nail.length = Math.min(nail.maxLength, nail.length + nail.growSpeed * dt);
      }
    }

    // Update flying clippings
    for (let i = clippings.length - 1; i >= 0; i--) {
      const c = clippings[i];
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 760 * dt; // Gravity
      c.rot += c.vRot * dt;
      if (c.y > canvas.height + 50) {
        clippings.splice(i, 1);
      }
    }

    // Update floating texts
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.alpha -= dt * 1.15;
      if (ft.alpha <= 0) {
        floatingTexts.splice(i, 1);
      }
    }

    updateHUD();
  }

  // Render Scene
  function draw() {
    ctx.save();

    // Apply subtle screen shake
    if (screenShake > 0) {
      const dx = (Math.random() - 0.5) * screenShake;
      const dy = (Math.random() - 0.5) * screenShake;
      ctx.translate(dx, dy);
    }

    // Salon Floor / Spa Mat Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, "#e0f2fe");
    bgGrad.addColorStop(1, "#bae6fd");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Decorative Spa Stripes
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    for (let x = 0; x < canvas.width; x += 90) {
      ctx.fillRect(x, 0, 45, canvas.height);
    }

    // Foot Base Arch
    ctx.fillStyle = "#f4bfa1";
    ctx.beginPath();
    ctx.ellipse(canvas.width / 2, canvas.height + 70, 410, 145, 0, Math.PI, 0);
    ctx.fill();

    // Draw Each Toe & Growing Nail
    for (const toe of toes) {
      const nail = toe.nail;
      const winceOffset = toe.winceTimer > 0 ? Math.sin(toe.winceTimer * 45) * 6 : 0;
      const tx = toe.x + winceOffset;
      const topY = toe.baseY - toe.height;

      // Toe Body
      ctx.fillStyle = toe.winceTimer > 0 ? "#fca5a5" : "#f7cbb2";
      ctx.strokeStyle = "#d99b78";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(tx - toe.width / 2, topY, toe.width, toe.height + 20, [
        toe.width * 0.48,
        toe.width * 0.48,
        0,
        0
      ]);
      ctx.fill();
      ctx.stroke();

      // Toe Knuckle Crease
      ctx.strokeStyle = "rgba(180, 110, 75, 0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx, topY + toe.height * 0.55, toe.width * 0.24, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();

      // Nail Bed (Pink Base)
      const nailW = toe.width * 0.72;
      const bedH = 38;
      const bedTopY = topY + 22;

      ctx.fillStyle = "#f9a8d4";
      ctx.beginPath();
      ctx.roundRect(tx - nailW / 2, bedTopY, nailW, bedH, [8, 8, 16, 16]);
      ctx.fill();

      // Growing Nail Plate
      const nailTopY = bedTopY - nail.length;
      const nailPlateX = tx - nailW / 2;
      const nailPlateWidth = nailW;

      ctx.fillStyle = "#173ea8";
      ctx.strokeStyle = "#dbeafe";
      ctx.lineWidth = 2.5;

      ctx.beginPath();
      ctx.roundRect(nailPlateX, nailTopY, nailPlateWidth, nail.length + 10, [18, 18, 4, 4]);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(
        nailPlateX + nailPlateWidth * 0.2,
        nailTopY + 4,
        nailPlateWidth * 0.6,
        Math.max(12, nail.length + 2)
      );

      const hasStarImage = starOfDavidImage && starOfDavidImage.complete && starOfDavidImage.naturalWidth > 0;
      if (hasStarImage) {
        const starSize = Math.min(nailPlateWidth * 0.92, Math.max(12, nail.length * 0.7));
        const starX = nailPlateX + (nailPlateWidth - starSize) / 2;
        const starY = nailTopY + Math.max(4, (nail.length - starSize) * 0.25);
        ctx.drawImage(starOfDavidImage, starX, starY, starSize, starSize);
      } else {
        ctx.fillStyle = "#f8fafc";
        ctx.beginPath();
        ctx.moveTo(nailPlateX + nailPlateWidth * 0.5, nailTopY + 6);
        ctx.lineTo(nailPlateX + nailPlateWidth * 0.78, nailTopY + 24);
        ctx.lineTo(nailPlateX + nailPlateWidth * 0.5, nailTopY + nail.length * 0.7);
        ctx.lineTo(nailPlateX + nailPlateWidth * 0.22, nailTopY + 24);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#173ea8";
        ctx.beginPath();
        ctx.moveTo(nailPlateX + nailPlateWidth * 0.5, nailTopY + 14);
        ctx.lineTo(nailPlateX + nailPlateWidth * 0.66, nailTopY + 24);
        ctx.lineTo(nailPlateX + nailPlateWidth * 0.5, nailTopY + nail.length * 0.58);
        ctx.lineTo(nailPlateX + nailPlateWidth * 0.34, nailTopY + 24);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#f8fafc";
        ctx.beginPath();
        ctx.moveTo(nailPlateX + nailPlateWidth * 0.5, nailTopY + 18);
        ctx.lineTo(nailPlateX + nailPlateWidth * 0.62, nailTopY + 36);
        ctx.lineTo(nailPlateX + nailPlateWidth * 0.5, nailTopY + nail.length * 0.88);
        ctx.lineTo(nailPlateX + nailPlateWidth * 0.38, nailTopY + 36);
        ctx.closePath();
        ctx.fill();
      }

      // Green Target Trim Zone Indicator
      if (nail.length >= nail.targetMin) {
        const zoneTop = Math.max(nailTopY, bedTopY - nail.targetMax);
        const zoneBottom = bedTopY - nail.targetMin;
        const zoneH = Math.max(6, zoneBottom - zoneTop);

        ctx.fillStyle = "rgba(6, 214, 160, 0.35)";
        ctx.fillRect(tx - nailW / 2, zoneTop, nailW, zoneH);

        // Dashed Trim Guide Line
        ctx.strokeStyle = "#059669";
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx - nailW / 2 - 6, (zoneTop + zoneBottom) / 2);
        ctx.lineTo(tx + nailW / 2 + 6, (zoneTop + zoneBottom) / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw Flying Clippings
    for (const c of clippings) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, c.width / 2, c.height / 2, 0, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Draw Floating Score Popups
    for (const ft of floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.font = "900 18px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 4;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    // Draw Precision Metallic Nail Clippers at Cursor
    drawClippers(clipper.x, clipper.y, clipper.snapAnim);

    ctx.restore();
  }

  function drawClippers(x, y, snap) {
    ctx.save();
    ctx.translate(x, y);

    const jawGap = 10 * (1 - snap * 0.85);

    // Clipper Handle Body (Angled Metallic Lever)
    ctx.fillStyle = "#475569";
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(14, -14, 78, 22, 8);
    ctx.fill();
    ctx.stroke();

    // Top Lever Arm
    ctx.fillStyle = "#94a3b8";
    ctx.beginPath();
    ctx.roundRect(18, -22 + snap * 7, 74, 9, 5);
    ctx.fill();
    ctx.stroke();

    // Upper & Lower Cutting Blades
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(-18, -jawGap);
    ctx.lineTo(18, -12);
    ctx.lineTo(18, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-18, jawGap);
    ctx.lineTo(18, 10);
    ctx.lineTo(18, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Precision Aim Reticle Dot
    ctx.fillStyle = "#ff4d8d";
    ctx.beginPath();
    ctx.arc(-18, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // HUD Synchronization
  function updateHUD() {
    clippedCountEl.textContent = `${clippedNails} / ${TARGET_NAILS}`;
    comboCountEl.textContent = `x${combo}`;
    scoreCountEl.textContent = score.toLocaleString();
    timeLeftEl.textContent = `${timeLeft.toFixed(1)}s`;

    const pct = Math.min(100, Math.round((clippedNails / TARGET_NAILS) * 100));
    progressFillEl.style.width = `${pct}%`;
    progressPercentEl.textContent = `${pct}%`;
  }

  // Main Animation Loop
  function gameLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    update(dt);
    draw();

    requestAnimationFrame(gameLoop);
  }

  // Start / End Game Handlers
  function startGame() {
    clippedNails = 0;
    score = 0;
    combo = 1;
    maxCombo = 1;
    timeLeft = INITIAL_TIME;
    clippings = [];
    floatingTexts = [];
    initToes();
    updateHUD();

    isPlaying = true;
    menuOverlay.classList.add("hidden");
    syncMusic();
  }

  function endGame(victory) {
    isPlaying = false;
    syncMusic();
    menuOverlay.classList.remove("hidden");
    finalStats.classList.remove("hidden");

    modalTag.textContent = victory ? "LEGENDARY PEDICURIST!" : "TIME'S UP!";
    modalTitle.textContent = victory ? "500 NAILS CLIPPED!" : "SHIFT COMPLETE";
    modalDesc.textContent = victory
      ? "Unbelievable speed and precision! You conquered the Toenail Clipper 500 challenge."
      : "Great effort at the spa! Ready for another round to reach all 500 nails?";

    finalScoreEl.textContent = score.toLocaleString();
    finalClippedEl.textContent = `${clippedNails} / ${TARGET_NAILS}`;
    finalComboEl.textContent = `x${maxCombo}`;
    startBtn.textContent = "PLAY AGAIN";
  }

  // Input Listeners
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    clipper.x = (e.clientX - rect.left) * scaleX;
    clipper.y = (e.clientY - rect.top) * scaleY;
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) attemptClip();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && isPlaying) {
      e.preventDefault();
      attemptClip();
    }
  });

  startBtn.addEventListener("click", startGame);
  resetBtn.addEventListener("click", startGame);

  soundToggleBtn.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    soundToggleBtn.textContent = soundEnabled ? "🔊 Sound: ON" : "🔇 Sound: OFF";
    syncMusic();
  });

  // Initialize Scene
  initToes();
  updateHUD();
  syncMusic();
  requestAnimationFrame(gameLoop);
})();