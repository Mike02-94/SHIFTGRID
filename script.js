window.addEventListener('DOMContentLoaded', () => {
  const loadingBar = document.getElementById('loading-bar');
  const startBtn = document.getElementById('startBtn');
  const gameContainer = document.querySelector('.container');

  // Hide start button initially
  startBtn.style.display = 'none';
  startBtn.style.opacity = '0';

  // Fake loading animation
  let progress = 0;
  const loadingInterval = setInterval(() => {
    progress += Math.random() * 10;
    if (progress >= 100) {
      progress = 100;
      loadingBar.style.width = progress + '%';
      clearInterval(loadingInterval);

      // Show start button with fade-in effect
      startBtn.style.display = 'block';
      void startBtn.offsetWidth; // Force reflow
      startBtn.style.opacity = '1';
    } else {
      loadingBar.style.width = progress + '%';
    }
  }, 100);

  // Start button click
  startBtn.addEventListener('click', () => {
    document.getElementById('loading-screen').style.display = 'none';
    gameContainer.style.display = 'flex';
    initGame();
  });

  // Initialize saved theme
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeToggleBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
});


const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const previewCanvas = document.getElementById("preview");
const previewCtx = previewCanvas.getContext("2d");
const holdCanvas = document.getElementById("hold");
const holdCtx = holdCanvas.getContext("2d");
const themeToggleBtn = document.getElementById("themeToggleBtn");

// 🟨 Theme-aware Tetris block colors
function getThemeColors() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  return isDark
    ? ["", "#00f0f0", "#0000f0", "#f0a000", "#f0f000", "#00f000", "#a000f0", "#f00000", "#00c0ff"]
    : ["", "#80d8d8", "#92aafc", "#f7ab73", "#f2e665", "#85d98e", "#ce96f2", "#f47b7b", "#87c9ff"];
}


let colors = getThemeColors();

// Update colors on theme change
const observer = new MutationObserver(() => {
  colors = getThemeColors();
});
observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

const ROWS = 20, COLS = 10, BLOCK_SIZE = 30;
let grid, currentPiece, nextPiece, heldPiece, score, level, lines, dropInterval, dropCounter, lastTime;
let gameOver = false, paused = false, gameStarted = false, combo = 0, pendingClear = null;
let particles = [], shiftChances = 2, canHold = true;
let shockwaveBlocks = []; 

// POWERUP SYSTEM VARIABLES
let powerups = [];
let activePowerups = [];
let powerupParticles = [];
let nextPowerupScore = 1500;
let gameStartTime = 0;
let lastPowerupTime = 0;
let ghostModeRemaining = 0;
let slowTimeRemaining = 0;
let originalDropInterval = 1000; // ✅ Used for restoring speed
let defaultDropInterval = 1000;  // ✅ Optional: remove if unused
let bombMode = false; 
let currentLevel = 1;
let levelBarElem = null;
let levelTextElem = null;
let levelProgress = 0;

let challengeActive = false;
let currentChallengeType = null; // ✅ Track which challenge is active
let flippedControls = false;
let canRotate = true;
let showPreview = true;
let challengeTriggeredLevels = [];
let challengePool = [];



const POWERUP_TYPES = {
  AUTO_CLEAR: 'auto_clear',
  BOMB: 'bomb',
  GHOST: 'ghost',
  SLOW_TIME: 'slow_time'
};

const POWERUP_CONFIG = {
  [POWERUP_TYPES.AUTO_CLEAR]: {
    name: "Auto Clear",
    color: "#FFD700",
    icon: "🔥",
    description: "Clears bottom row"
  },
  [POWERUP_TYPES.BOMB]: {
    name: "Bomb",
    color: "#FF4500",
    icon: "💣",
    description: "Click to destroy 3x3 area"
  },
  [POWERUP_TYPES.GHOST]: {
    name: "Ghost Mode",
    color: "#9370DB",
    icon: "👻",
    description: "Next 3 pieces pass through blocks"
  },
  [POWERUP_TYPES.SLOW_TIME]: {
    name: "Slow Time",
    color: "#00CED1",
    icon: "⏰",
    description: "Slow drop speed for 15s"
  }
};

// Load level data from localStorage
function loadLevelData() {
  const savedLevel = parseInt(localStorage.getItem("currentLevel") || "1");
  const savedProgress = parseInt(localStorage.getItem("levelProgress") || "0");
  currentLevel = savedLevel;
  levelProgress = savedProgress;
}

// Save level data to localStorage
function saveLevelData() {
  localStorage.setItem("currentLevel", currentLevel);
  localStorage.setItem("levelProgress", levelProgress);
}

// Update level bar UI
function updateLevelBar() {
  if (!levelBarElem || !levelTextElem) return;

  const linesNeeded = 10; // Always 10 lines per level
  const percent = (levelProgress / linesNeeded) * 100;
  
  levelBarElem.style.width = percent + "%";
  levelTextElem.textContent = `Level ${currentLevel}: ${levelProgress} / ${linesNeeded} lines`;
}

// Add progress and handle level ups
function addLevelProgress(linesCleared) {
  levelProgress += linesCleared;
  let leveledUp = false;

  // Check if player leveled up (10 lines = 1 level)
  while (levelProgress >= 10) {
    levelProgress -= 10; // Reset progress for new level
    currentLevel++;
    leveledUp = true;

    // ✅ Trigger random level challenge
    checkRandomLevelChallenge(currentLevel);
  }

  updateLevelBar();
  saveLevelData();

  if (leveledUp) {
    showLevelUpPopup();
  }
}


function getNextRandomChallenge() {
  if (challengePool.length === 0) {
    // Refill and shuffle when exhausted
    challengePool = ["fast", "rotate", "flip", "preview", "wobble"];
    challengePool.sort(() => Math.random() - 0.5);
  }
  return challengePool.pop(); // Take one from the end
}

function checkRandomLevelChallenge(level) {
  if (challengeTriggeredLevels.includes(level)) return;

    if (level % 2 === 1 && level >= 3 && level <= 99) {
    const challengeType = getNextRandomChallenge();
    challengeTriggeredLevels.push(level);

    switch (challengeType) {
      case "fast": triggerFastDrop(); break;
      case "rotate": triggerNoRotate(); break;
      case "flip": triggerFlipControls(); break;
      case "preview": triggerBlindPreview(); break;
      case "wobble": triggerWobbleScreen(); break;
       case "glitch": triggerGlitchChallenge(); break; 
    }
  }
}


function triggerFastDrop() {
  if (challengeActive) return;
  challengeActive = true;
  currentChallengeType = "fast";

  // ⚠️ Set EXTREMELY fast drop for real panic!
  dropInterval = 10;  
  originalDropInterval = 10;  

  const gameArea = document.getElementById("game-area");
  if (gameArea) {
    gameArea.classList.add("extreme-speed");
  }

  playSound("challenge");
  showChallengePopup("💀 ULTRA Fast Drop for 20s! GOOD LUCK!", 20000);

  setTimeout(() => {
    dropInterval = getDropInterval(currentLevel);
    originalDropInterval = dropInterval;
    challengeActive = false;
    currentChallengeType = null;

    if (gameArea) {
      gameArea.classList.remove("extreme-speed");
    }
  }, 20000);
}


function triggerNoRotate() {
  if (challengeActive) return;
  challengeActive = true;
  currentChallengeType = "rotate";

  canRotate = false;
  showChallengePopup("🔁 No Rotation for 15 seconds!", 15000);

  setTimeout(() => {
    canRotate = true;
    challengeActive = false;
    currentChallengeType = null;
  }, 15000);
}

function triggerFlipControls() {
  if (challengeActive) return;
  challengeActive = true;
  currentChallengeType = "flip";

  flippedControls = true;
  showChallengePopup("↩️ Controls Reversed for 10 seconds!", 10000);

  setTimeout(() => {
    flippedControls = false;
    challengeActive = false;
    currentChallengeType = null;
  }, 10000);
}

function triggerBlindPreview() {
  if (challengeActive) return;
  challengeActive = true;
  currentChallengeType = "preview";

  showPreview = false;
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  showChallengePopup("❌ Preview Hidden for 30 seconds!", 30000);

  setTimeout(() => {
    showPreview = true;
    drawPreview();
    challengeActive = false;
    currentChallengeType = null;
  }, 30000);
}

function triggerWobbleScreen() {
  if (challengeActive) return;

  challengeActive = true;
  currentChallengeType = "wobble";

  const gameArea = document.getElementById("game-area");
  
  // Add shake only if not already glitching
  if (gameArea && !gameArea.classList.contains("glitching")) {
    gameArea.classList.add("shake");
  }

  showChallengePopup("📳 Screen Wobble for 10 seconds!", 10000);

  setTimeout(() => {
    // Remove shake only if still not glitching
    if (gameArea && !gameArea.classList.contains("glitching")) {
      gameArea.classList.remove("shake");
    }

    challengeActive = false;
    currentChallengeType = null;
  }, 10000);
}


function triggerGlitchChallenge() {
  if (challengeActive) return;
  challengeActive = true;
  currentChallengeType = "glitch";

  canHold = false;
  shiftChances = 0;
  showPreview = false;

  const gameArea = document.getElementById("game-area");
  if (gameArea && !gameArea.classList.contains("glitching")) {
    gameArea.classList.add("glitching");
  }

  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  playSound("glitching");
  showChallengePopup("⚠️ GLITCH MODE for 10 seconds!", 10000);

  setTimeout(() => {
    canHold = true;
    shiftChances = 2;
    showPreview = true;
    drawPreview();
    challengeActive = false;
    currentChallengeType = null;

    // Slight delay before removing the visual glitch effect
    setTimeout(() => {
      if (gameArea) {
        gameArea.classList.remove("glitching");
      }
    }, 200);
  }, 10000);
}


// Visual popup on level up
function showLevelUpPopup() {
  const div = document.createElement("div");
  div.className = "levelup-popup";
  div.textContent = `⭐ Level Up! Level ${currentLevel}.`;

  // Append to game-area instead of document.body
  const gameArea = document.getElementById("game-area");
  gameArea.appendChild(div);

  // Position it at the center of the game area
  div.style.position = "absolute";
  div.style.left = "50%";
  div.style.top = "50%";
  div.style.transform = "translate(-50%, -50%)";

  setTimeout(() => div.remove(), 2500);
}


function showChallengePopup(message, duration = 10000) {
  playSound("challenge");
  const container = document.getElementById("challenge-popup-container");
  if (!container) return;

  const popup = document.createElement("div");
  popup.className = "challenge-popup";
  popup.innerHTML = `⚠️ ${message}<div class="challenge-timer-bar"></div>`;

  container.appendChild(popup);

  // Animate timer bar
  const timerBar = popup.querySelector(".challenge-timer-bar");
  timerBar.style.transition = `width ${duration}ms linear`;
  setTimeout(() => {
    timerBar.style.width = "0%";
  }, 50);

  // Remove popup after duration
  setTimeout(() => {
    popup.remove();
  }, duration);
}




const scoreElem = document.getElementById("score");
const levelElem = document.getElementById("level");
const gameOverElem = document.getElementById("gameOver");

const sounds = {
  bgm: new Audio("sounds/bgm.mp3"),
  softdrop: new Audio("sounds/softdrop.mp3"),
  harddrop: new Audio("sounds/harddrop.mp3"),
  lineclear: new Audio("sounds/lineclear.mp3"),
  rotate: new Audio("sounds/rotate.mp3"),
  move: new Audio("sounds/move.mp3"),
  gameover: new Audio("sounds/gameover.mp3"),
  button: new Audio("sounds/button.mp3"),
  levelup: new Audio("sounds/levelup.mp3"),
  shift: new Audio("sounds/shift.mp3"),        
  hold: new Audio("sounds/hold.mp3"),
  powerup: new Audio("sounds/powerupsound.mp3"), 
  bomb: new Audio("sounds/bomb.mp3"),
  challenge: new Audio("sounds/challenge.mp3"),
  glitch: new Audio("sounds/glitching.mp3"),
  "powerup-autoclear": new Audio("sounds/powerup-autoclear.mp3"),
  "powerup-bomb": new Audio("sounds/powerup-bomb.mp3"),
  "powerup-ghost": new Audio("sounds/powerup-ghost.mp3"),
  "powerup-slowtime": new Audio("sounds/powerup-slowtime.mp3")
};

// Initialize volume controls
let musicVolume = 0.5;
let sfxVolume = 0.5;
sounds.bgm.loop = true;
Object.values(sounds).forEach(s => s.preload = "auto");

// Volume control setup
const musicVolumeSlider = document.getElementById("musicVolume");
const sfxVolumeSlider = document.getElementById("sfxVolume");
const musicVolumeValue = document.getElementById("musicVolumeValue");
const sfxVolumeValue = document.getElementById("sfxVolumeValue");

musicVolumeSlider.addEventListener("input", (e) => {
  musicVolume = e.target.value / 100;
  sounds.bgm.volume = musicVolume;
});
sfxVolumeSlider.addEventListener("input", (e) => {
  sfxVolume = e.target.value / 100;
  Object.keys(sounds).forEach(key => {
    if (key !== 'bgm') {
      sounds[key].volume = sfxVolume;
    }
  });
});

sounds.bgm.volume = musicVolume;
Object.keys(sounds).forEach(key => {
  if (key !== 'bgm') {
    sounds[key].volume = sfxVolume;
  }
});

const pieces = [
  [[8, 8, 8, 8]], [[1, 1, 1], [0, 1, 0]], [[0, 2, 2], [2, 2, 0]],
  [[3, 3, 0], [0, 3, 3]], [[4, 4], [4, 4]], [[0, 5, 0], [5, 5, 5]],
  [[6, 0, 0], [6, 6, 6]], [[0, 0, 7], [7, 7, 7]]
];

  // POWERUP SYSTEM FUNCTIONS
  function createPowerup() {
    // Balanced weighted distribution - each powerup gets fair representation
    const weightedTypes = [
      POWERUP_TYPES.AUTO_CLEAR,
      POWERUP_TYPES.AUTO_CLEAR, // Give AUTO_CLEAR some extra weight
      POWERUP_TYPES.BOMB,
      POWERUP_TYPES.BOMB,       // Give BOMB extra weight for fairness
      POWERUP_TYPES.GHOST,
      POWERUP_TYPES.SLOW_TIME,
      POWERUP_TYPES.SLOW_TIME   // Keep SLOW_TIME with extra weight
    ];
    
    const type = weightedTypes[Math.floor(Math.random() * weightedTypes.length)];
    const config = POWERUP_CONFIG[type];
    
    return {
      type,
      name: config.name,
      color: config.color,
      icon: config.icon,
      description: config.description,
      id: Date.now() + Math.random()
    };
  }


  function addPowerup(powerup) {
  // Only add powerup if player has less than 4 powerups
  if (powerups.length < 4) {
    powerups.push(powerup);
    createPowerupParticles(powerup);
    showPowerupNotification(powerup);
    playSound("powerup");
  }
  // If inventory is full, don't add the powerup (silently ignore)
}

  function createPowerupParticles(powerup) {
    const config = POWERUP_CONFIG[powerup.type];
    for (let i = 0; i < 15; i++) {
      powerupParticles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        dx: (Math.random() - 0.5) * 4,
        dy: (Math.random() - 0.5) * 4,
        alpha: 1,
        color: config.color,
        size: Math.random() * 8 + 4,
        life: 60
      });
    }
  }
  function showPowerupNotification(powerup) {
    const div = document.createElement("div");
    div.className = "combo-popup";
    div.innerHTML = `${powerup.icon} ${powerup.name}!`;
    div.style.color = powerup.color;
    div.style.fontSize = "20px";
    document.body.appendChild(div);
    
    const rect = canvas.getBoundingClientRect();
    div.style.left = `${rect.left + canvas.width / 2 - 80}px`;
    div.style.top = `${rect.top + canvas.height / 3}px`;
    
    setTimeout(() => div.remove(), 1200);
  }

  function checkPowerupTriggers() {
    const currentTime = Date.now();
    let powerupGiven = false;
    
    // Score-based trigger
    if (!powerupGiven && score >= nextPowerupScore) {
      const powerup = createPowerup();
      addPowerup(powerup);
      nextPowerupScore += 1500;
      powerupGiven = true;
    }
    
    // Time-based trigger (every 60 seconds instead of 90)
    if (!powerupGiven && currentTime - lastPowerupTime > 60000) {
      const powerup = createPowerup();
      addPowerup(powerup);
      lastPowerupTime = currentTime;
      powerupGiven = true;
    }
    
    // Combo-based trigger with better chance
    if (!powerupGiven && combo >= 3 && Math.random() < 0.4) {
      if (currentTime - lastPowerupTime > 8000) { // 8 second cooldown
        const powerup = createPowerup();
        addPowerup(powerup);
        lastPowerupTime = currentTime;
        powerupGiven = true;
      }
    }
  }


function usePowerup(index) {
  const powerup = powerups[index];
  if (!powerup) return;

  // ✅ Remove the powerup from the list before using
  powerups.splice(index, 1);

  // ✅ Activate it using the cleaner switch logic
  activatePowerup(powerup.type);

  // ✅ Create visual particle effect
  createActivationParticles(powerup);
}

function activatePowerup(type) {
  switch (type) {
    case POWERUP_TYPES.AUTO_CLEAR:
      playSound("powerup-autoclear");
      activateAutoClear();
      break;
    case POWERUP_TYPES.BOMB:
      playSound("powerup-bomb");
      activateBomb();
      break;
    case POWERUP_TYPES.GHOST:
      playSound("powerup-ghost");
      activateGhost();
      break;
    case POWERUP_TYPES.SLOW_TIME:
      playSound("powerup-slowtime");
      activateSlowTime();
      break;
    default:
      console.warn("Unknown powerup type:", type);
  }
}


  function activateAutoClear() {
    // Clear the bottom row
    let clearedRows = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (grid[y].some(cell => cell !== 0)) {
        // Create particles for the cleared row
        for (let x = 0; x < COLS; x++) {
          if (grid[y][x] !== 0) {
            createParticles(x * BLOCK_SIZE, y * BLOCK_SIZE, colors[grid[y][x]]);
          }
        }
        
        // Clear the row
        grid.splice(y, 1);
        grid.unshift(Array(COLS).fill(0));
        clearedRows++;
        break; // Only clear one row at a time
      }
    }
    
    if (clearedRows > 0) {
      score += clearedRows * 200; // Bonus score for powerup clear
      lines += clearedRows;
      addXP(clearedRows * 50);
      updateScore();
      playSound("lineclear");
    }
  }
  function activateBomb() {
    bombMode = true;
    canvas.style.cursor = 'crosshair';
    
    // Show bomb instruction with better positioning
    const div = document.createElement("div");
    div.className = "combo-popup";
    div.innerHTML = "💣 BOMB ACTIVE! Click anywhere to explode!";
    div.style.color = "#FF4500";
    div.style.fontSize = "20px";
    div.style.fontWeight = "bold";
    div.style.background = "rgba(0,0,0,0.8)";
    div.style.padding = "10px";
    div.style.borderRadius = "5px";
    div.style.border = "2px solid #FF4500";
    document.body.appendChild(div);
    
    const rect = canvas.getBoundingClientRect();
    div.style.left = `${rect.left + canvas.width / 2 - 120}px`;
    div.style.top = `${rect.top + 20}px`;
    
    // Keep instruction visible longer
    setTimeout(() => div.remove(), 5000);
    
    // Add visual overlay to show bomb mode is active
    setTimeout(() => {
      if (bombMode) {
        showBombOverlay();
      }
    }, 100);
  }
  function activateGhost() {
    ghostModeRemaining = 3;
    
    // Visual feedback
    const div = document.createElement("div");
    div.className = "combo-popup";
    div.innerHTML = "👻 Ghost Mode Active!";
    div.style.color = "#9370DB";
    div.style.fontSize = "18px";
    document.body.appendChild(div);
    
    const rect = canvas.getBoundingClientRect();
    div.style.left = `${rect.left + canvas.width / 2 - 80}px`;
    div.style.top = `${rect.top + 50}px`;
    
    setTimeout(() => div.remove(), 2000);
  }

  // FIXED: Better slow time activation with more noticeable effect
  function activateSlowTime() {
    slowTimeRemaining = 15000; // 15 seconds
    originalDropInterval = dropInterval;
    
    // Make the slowdown more dramatic - 3x slower instead of 2x
    dropInterval = Math.max(dropInterval * 3, 300);
    
    // Visual feedback with better positioning
    const div = document.createElement("div");
    div.className = "combo-popup";
    div.innerHTML = "⏰ TIME SLOWED! (15s)";
    div.style.color = "#00CED1";
    div.style.fontSize = "20px";
    div.style.fontWeight = "bold";
    div.style.background = "rgba(0,0,0,0.8)";
    div.style.padding = "8px 16px";
    div.style.borderRadius = "5px";
    div.style.border = "2px solid #00CED1";
    document.body.appendChild(div);
    
    const rect = canvas.getBoundingClientRect();
    div.style.left = `${rect.left + canvas.width / 2 - 100}px`;
    div.style.top = `${rect.top + 30}px`;
    
    setTimeout(() => div.remove(), 3000);
    
    // Add screen tint effect
    createSlowTimeEffect();
  }

  // NEW: Visual effect for slow time
  function createSlowTimeEffect() {
    for (let i = 0; i < 50; i++) {
      powerupParticles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        dx: (Math.random() - 0.5) * 2,
        dy: (Math.random() - 0.5) * 2,
        alpha: 0.6,
        color: "#00CED1",
        size: Math.random() * 6 + 2,
        life: 120
      });
    }
  }

  function handleBombClick(x, y) {
    if (!bombMode) return;
    
    const gridX = Math.floor(x / BLOCK_SIZE);
    const gridY = Math.floor(y / BLOCK_SIZE);
    
    console.log(`Bomb clicked at canvas (${x}, ${y}) -> grid (${gridX}, ${gridY})`);
    
    // Create bomb explosion effect with more particles
    for (let i = 0; i < 100; i++) {
      particles.push({
        x: x,
        y: y,
        dx: (Math.random() - 0.5) * 16,
        dy: (Math.random() - 0.5) * 16,
        alpha: 1,
        color: Math.random() > 0.5 ? "#FF4500" : "#FFD700" // Mix of orange and gold
      });
    }
    
    // Show explosion point visually
    createExplosionEffect(x, y);
    
    // Destroy 3x3 area
    let destroyedBlocks = 0;
    const destroyedPositions = [];
    
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = gridX + dx;
        const ty = gridY + dy;
        
        if (tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS && grid[ty][tx] !== 0) {
          // Store the block info before destroying
          const blockColor = colors[grid[ty][tx]];
          destroyedPositions.push({x: tx, y: ty, color: blockColor});
          
          // Create particles for each destroyed block
          createParticles(tx * BLOCK_SIZE, ty * BLOCK_SIZE, blockColor);
          
          // Destroy the block
          grid[ty][tx] = 0;
          destroyedBlocks++;
        }
      }
    }
    
    console.log(`Destroyed ${destroyedBlocks} blocks at positions:`, destroyedPositions);
    
    if (destroyedBlocks > 0) {
      score += destroyedBlocks * 50;
      updateScore();
      playSound("bomb");
      
      // Show destruction feedback
      showDestructionFeedback(destroyedBlocks);
    } else {
      // Show "no blocks destroyed" message
      showNoDestructionFeedback();
    }
    
    // Deactivate bomb mode
    bombMode = false;
    canvas.style.cursor = 'default';
  }
  function showBombOverlay() {
    // This will be called in the draw function to show bomb targeting
    if (bombMode) {
      ctx.fillStyle = 'rgba(255, 69, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Add pulsing border
      const pulseAlpha = 0.5 + 0.3 * Math.sin(Date.now() * 0.01);
      ctx.strokeStyle = `rgba(255, 69, 0, ${pulseAlpha})`;
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
      
      // Add text reminder
      ctx.fillStyle = '#FF4500';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';ctx.lineWidth = 3;
      ctx.fillText('BOMB MODE: Click to explode!', canvas.width/2, canvas.height - 20);
    }
  }
  function createExplosionEffect(x, y) {
    // Create a temporary explosion visual
    const explosionDiv = document.createElement("div");
    explosionDiv.innerHTML = "💥";
    explosionDiv.style.position = "absolute";
    explosionDiv.style.fontSize = "40px";
    explosionDiv.style.pointerEvents = "none";
    explosionDiv.style.zIndex = "1000";
    explosionDiv.style.animation = "explosion 0.5s ease-out";
    
    const rect = canvas.getBoundingClientRect();
    explosionDiv.style.left = `${rect.left + x - 20}px`;
    explosionDiv.style.top = `${rect.top + y - 20}px`;
    
    document.body.appendChild(explosionDiv);
    
    setTimeout(() => explosionDiv.remove(), 500);
  }
  function showDestructionFeedback(count) {
    const div = document.createElement("div");
    div.className = "combo-popup";
    div.innerHTML = `ðŸ’¥ ${count} blocks destroyed!`;
    div.style.color = "#FF4500";
    div.style.fontSize = "18px";
    div.style.fontWeight = "bold";
    document.body.appendChild(div);
    
    const rect = canvas.getBoundingClientRect();
    div.style.left = `${rect.left + canvas.width / 2 - 80}px`;
    div.style.top = `${rect.top + canvas.height / 2}px`;
    
    setTimeout(() => div.remove(), 2000);
  }
  function showNoDestructionFeedback() {
    const div = document.createElement("div");
    div.className = "combo-popup";
    div.innerHTML = "ðŸ’£ No blocks in range!";
    div.style.color = "#FFA500";
    div.style.fontSize = "16px";
    document.body.appendChild(div);
    
    const rect = canvas.getBoundingClientRect();
    div.style.left = `${rect.left + canvas.width / 2 - 80}px`;
    div.style.top = `${rect.top + canvas.height / 2}px`;
    
    setTimeout(() => div.remove(), 1500);
  }

  function updatePowerupEffects(deltaTime) {
    // Update slow time with better tracking
    if (slowTimeRemaining > 0) {
      slowTimeRemaining -= deltaTime;
      
      // Show countdown in UI
      const secondsLeft = Math.ceil(slowTimeRemaining / 1000);
      
      if (slowTimeRemaining <= 0) {
        // Reset to original speed
        dropInterval = originalDropInterval;
        slowTimeRemaining = 0;
        
        // Show "time restored" message
        const div = document.createElement("div");
        div.className = "combo-popup";
        div.innerHTML = "⚡ Normal Speed Restored!";
        div.style.color = "#FFD700";
        div.style.fontSize = "16px";
        document.body.appendChild(div);
        
        const rect = canvas.getBoundingClientRect();
        div.style.left = `${rect.left + canvas.width / 2 - 100}px`;
        div.style.top = `${rect.top + 60}px`;
        
        setTimeout(() => div.remove(), 1500);
      }
    }
    
    // Update powerup particles
    powerupParticles = powerupParticles.filter(p => {
      p.x += p.dx;
      p.y += p.dy;
      p.alpha -= 0.01; // Slower fade for slow time particles
      p.life--;
      return p.alpha > 0 && p.life > 0;
    });
  }

  function drawPowerupParticles() {
    powerupParticles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // IMPROVED: Better powerup UI with slow time countdown
  function drawPowerupUI() {
    // Draw powerup inventory
    if (powerups.length > 0) {
      const startX = 10;
      const startY = 10;
      const size = 35;
      const spacing = 45;
      
      powerups.forEach((powerup, index) => {
        const x = startX + (index * spacing);
        const y = startY;
        
        // Draw powerup background with glow
        ctx.save();
        ctx.shadowColor = powerup.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = powerup.color;
        ctx.fillRect(x, y, size, size);
        ctx.restore();
        
        // Draw powerup border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, size, size);
        
        // Draw powerup number
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText((index + 1).toString(), x + size/2, y + size/2 + 5);
        ctx.fillText((index + 1).toString(), x + size/2, y + size/2 + 5);
      });
    }
    
    // Draw active effect indicators
    let yOffset = 30;
    
    // Ghost mode indicator
    if (ghostModeRemaining > 0) {
      ctx.fillStyle = 'rgba(147, 112, 219, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = '#9370DB';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(`👻 Ghost Mode: ${ghostModeRemaining} pieces left`, canvas.width/2, yOffset);
      ctx.fillText(`👻 Ghost Mode: ${ghostModeRemaining} pieces left`, canvas.width/2, yOffset);
      yOffset += 25;
    }
    
    // Slow time indicator with countdown
    if (slowTimeRemaining > 0) {
      // Add blue tint to screen
      ctx.fillStyle = 'rgba(0, 206, 209, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const seconds = Math.ceil(slowTimeRemaining / 1000);
      ctx.fillStyle = '#00CED1';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(`⏰ Slow Time: ${seconds}s`, canvas.width/2, yOffset);
      ctx.fillText(`⏰ Slow Time: ${seconds}s`, canvas.width/2, yOffset);
    }
  }

  function createMatrix(w, h) {
    return Array.from({ length: h }, () => Array(w).fill(0));
  }
  function drawMatrix(matrix, offset, ctx) {
  const isGlitch = challengeActive && currentChallengeType === "glitch";

  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        // ✅ Blinking effect: sometimes semi-transparent, not invisible
        if (isGlitch && Math.random() < 0.3) {
          ctx.globalAlpha = 0.2;
        } else {
          ctx.globalAlpha = 1.0;
        }

        // ✅ Apply fill color
        ctx.fillStyle = colors[value];
        ctx.fillRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

        // ✅ Border
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.strokeRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        
        // ✅ Reset alpha after each block
        ctx.globalAlpha = 1.0;
      }
    });
  });
}


    // Reset glow after drawing
    ctx.shadowBlur = 0;


  function collide(grid, piece) {
    const { matrix, pos } = piece;
    return matrix.some((row, y) => row.some((value, x) => {
      const px = x + pos.x;
      const py = y + pos.y;
      
      // If ghost mode is active, allow passing through existing blocks
      if (ghostModeRemaining > 0) {
        return value !== 0 && (px < 0 || px >= COLS || py >= ROWS);
      }
      
      return value !== 0 && (px < 0 || px >= COLS || py >= ROWS || (py >= 0 && grid[py][px] !== 0));
    }));
  }

  function drawGhostPiece(piece) {
  const ghost = { matrix: piece.matrix, pos: { ...piece.pos } };

  while (!collide(grid, ghost)) ghost.pos.y++;
  ghost.pos.y--;

  ctx.save(); // Save current canvas state
  ctx.globalAlpha = 0.12; // Very faint
  ctx.fillStyle = "#ccc"; // Neutral gray ghost color

  piece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value !== 0) {
        ctx.fillRect(
          (x + ghost.pos.x) * BLOCK_SIZE,
          (y + ghost.pos.y) * BLOCK_SIZE,
          BLOCK_SIZE,
          BLOCK_SIZE
        );
      }
    });
  });

  ctx.restore(); // Restore original state
}


  function merge(grid, piece) {
    piece.matrix.forEach((row, y) =>
      row.forEach((value, x) => {
        if (value !== 0) grid[y + piece.pos.y][x + piece.pos.x] = value;
      })
    );
  }
  function rotate(matrix) {
    return matrix[0].map((_, i) => matrix.map(row => row[i])).reverse();
  }
  function playerDrop() {
    currentPiece.pos.y++;
    if (collide(grid, currentPiece)) {
      currentPiece.pos.y--;
      merge(grid, currentPiece);
      
      // Consume ghost mode when piece lands
      if (ghostModeRemaining > 0) {
        ghostModeRemaining--;
      }
      
      handleLineClear();
    } else {
      playSound("softdrop");
    }
    dropCounter = 0;
  }
  
  function hardDrop() {
    const landingY = currentPiece.pos.y; 
    while (!collide(grid, currentPiece)) currentPiece.pos.y++;
    currentPiece.pos.y--;
    
    
    const pieceWidth = currentPiece.matrix[0].length;
    const centerX = currentPiece.pos.x + Math.floor(pieceWidth / 2);
    const centerY = currentPiece.pos.y + Math.floor(currentPiece.matrix.length / 2);
    
    merge(grid, currentPiece);
    
    // Consume ghost mode when piece lands
    if (ghostModeRemaining > 0) {
      ghostModeRemaining--;
    }
    
    createShockwave(centerX, centerY); 
    handleLineClear();
    dropCounter = 0;
    playSound("harddrop");
  }

  function createShockwave(centerX, centerY) {
    const maxRadius = 15; // Maximum radius of the shockwave
    const duration = 700; // Duration of the animation in milliseconds
    
    
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x] !== 0) {
          const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
          
          const intensity = Math.max(0, 1 - (distance / maxRadius));
          const delay = distance * 30; 
          
          
          shockwaveBlocks.push({
            x: x,
            y: y,
            intensity: intensity,
            startTime: Date.now() + delay,  
            duration: duration,
            originalX: x,
            originalY: y
          });
        }
      }
    }
  }
  // Function to update and draw shockwave effects
  function updateShockwaveBlocks() {
    const currentTime = Date.now();
    
    shockwaveBlocks = shockwaveBlocks.filter(block => {
      const elapsed = currentTime - block.startTime;
      
      if (elapsed < 0) return true; 
      if (elapsed > block.duration) return false; 
      
      
      const progress = elapsed / block.duration;
      const shakeAmount = block.intensity * 10 * (1 - progress); 
      
      
      const shakeX = (Math.sin(elapsed * 0.03) * shakeAmount) * (Math.random() - 0.5);
      const shakeY = (Math.sin(elapsed * 0.025) * shakeAmount) * (Math.random() - 0.5);
      
      
      if (grid[block.y] && grid[block.y][block.x] !== 0) {
        const blockValue = grid[block.y][block.x];
        
        ctx.save();
        ctx.translate(shakeX, shakeY);
        ctx.shadowColor = colors[blockValue];
        ctx.shadowBlur = 4 + (block.intensity * 4);
        ctx.fillStyle = colors[blockValue];
        ctx.fillRect(block.x * BLOCK_SIZE, block.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(block.x * BLOCK_SIZE, block.y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        ctx.restore();
      }
      
      return true;
    });
  }
  function createParticles(x, y, color) {
    for (let i = 0; i < 25; i++) {
      particles.push({
        x: x + BLOCK_SIZE / 2,
        y: y + BLOCK_SIZE / 2,
        dx: (Math.random() - 0.5) * 6,
        dy: (Math.random() - 0.5) * 6,
        alpha: 1,
        color
      });
    }
  }
  function drawParticles() {
    particles.forEach(p => {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    });
    particles = particles.filter(p => {
      p.x += p.dx;
      p.y += p.dy;
      p.alpha -= 0.03;
      return p.alpha > 0;
    });
  }
  function handleLineClear() {
    const fullRows = [];
    for (let y = 0; y < ROWS; y++) {
      if (grid[y].every(cell => cell !== 0)) fullRows.push(y);
    }
    if (fullRows.length > 0) {
      pendingClear = { fullRows, frame: 0 };
      fullRows.forEach(y => {
        for (let x = 0; x < COLS; x++) {
          createParticles(x * BLOCK_SIZE, y * BLOCK_SIZE, colors[grid[y][x]]);
        }
      });
    } else {
      combo = 0;
      resetPiece();
    }
  }


  // UPDATED: Fix the processPendingClear function to use the new system
  function processPendingClear() {
    const { fullRows, frame } = pendingClear;
    if (frame < 6) {
      fullRows.forEach(y => {
        ctx.fillStyle = frame % 2 === 0 ? "#fff176" : "#f5f5f5";
        ctx.fillRect(0, y * BLOCK_SIZE, canvas.width, BLOCK_SIZE);
      });
      pendingClear.frame++;
    } else {
      fullRows.forEach(y => {
        grid.splice(y, 1);
        grid.unshift(Array(COLS).fill(0));
      });
      combo++;
      score += fullRows.length * 100;
      lines += fullRows.length;
      
      // UNIFIED LEVEL SYSTEM - Use only currentLevel
      addLevelProgress(fullRows.length);
      
      // SYNC traditional level with currentLevel for drop speed
      const oldLevel = level;
      level = currentLevel; // Keep them in sync
      
      // Update drop speed based on currentLevel (gentler curve)
      const newDropInterval = getDropInterval(currentLevel);
      originalDropInterval = newDropInterval;

      // Only update dropInterval if no slow time is active
      if (slowTimeRemaining <= 0) {
      dropInterval = newDropInterval;
      }
      // If slow time is active, keep the current slowed dropInterval
      
      // Play level up sound only when actually leveling up
      if (level > oldLevel) {
        playSound("levelup");
      }
      
      playSound("lineclear");
      showCombo(combo);
      updateScore();
      checkPowerupTriggers();
      pendingClear = null;  
      resetPiece();
    }
  }

  function showCombo(count) {
    if (count < 2) return;
    const div = document.createElement("div");
    div.className = "combo-popup";
    div.textContent = `Combo x${count}!`;
    document.body.appendChild(div);
    const rect = canvas.getBoundingClientRect();
    div.style.left = `${rect.left + canvas.width / 2 - 50}px`;
    div.style.top = `${rect.top + canvas.height / 4}px`;
    setTimeout(() => div.remove(), 3000);
  }

  function updateScore() {
    scoreElem.textContent = score;
    levelElem.textContent = currentLevel; 
  }

  function resetPiece() {
    currentPiece = nextPiece;
    currentPiece.pos = {
      x: Math.floor(COLS / 2) - Math.floor(currentPiece.matrix[0].length / 2),
      y: 0
    };
    nextPiece = createPiece();
    shiftChances = 2;
    canHold = true;
    if (collide(grid, currentPiece)) {
      gameOver = true;
      gameOverElem.style.display = 'block';
      playSound("gameover");
    }
    if (showPreview) drawPreview();
    else previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  }

  function createPiece() {
    const matrix = pieces[Math.floor(Math.random() * pieces.length)];
    return {
      matrix,
      pos: { x: Math.floor(COLS / 2) - Math.floor(matrix[0].length / 2), y: 0 }
    };
  }

  function drawPreview() {
    if (!showPreview) return; // 👈 Prevent drawing when blind preview is active

    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    const matrix = nextPiece.matrix;
    const shapeWidth = matrix[0].length * BLOCK_SIZE;
    const shapeHeight = matrix.length * BLOCK_SIZE;
    const offsetX = Math.floor((previewCanvas.width - shapeWidth) / 2);
    const offsetY = Math.floor((previewCanvas.height - shapeHeight) / 2);
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          previewCtx.fillStyle = colors[value];
          previewCtx.fillRect(offsetX + x * BLOCK_SIZE, offsetY + y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
          previewCtx.strokeStyle = "#000000";
          previewCtx.strokeRect(offsetX + x * BLOCK_SIZE, offsetY + y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        }
      });
    });
  }
  function drawHold() {
    holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (heldPiece) {
      const matrix = heldPiece.matrix;
      const shapeWidth = matrix[0].length * BLOCK_SIZE;
      const shapeHeight = matrix.length * BLOCK_SIZE;
      const offsetX = Math.floor((holdCanvas.width - shapeWidth) / 2);
      const offsetY = Math.floor((holdCanvas.height - shapeHeight) / 2);
      matrix.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value !== 0) {
            holdCtx.fillStyle = colors[value];
            holdCtx.fillRect(offsetX + x * BLOCK_SIZE, offsetY + y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
            holdCtx.strokeStyle = "#000000";
            holdCtx.strokeRect(offsetX + x * BLOCK_SIZE, offsetY + y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
          }
        });
      });
    }
  }
  function holdPiece() {
    if (!canHold) return;
    
    playSound("hold");
    
    if (heldPiece === null) {
      heldPiece = currentPiece;
      resetPiece();
    } else {
      const temp = heldPiece;
      heldPiece = currentPiece;
      currentPiece = temp;
      currentPiece.pos = {
        x: Math.floor(COLS / 2) - Math.floor(currentPiece.matrix[0].length / 2),
        y: 0
      };
    }
    
    canHold = false;
    drawHold();
  }
  function shiftPiece() {
    if (shiftChances <= 0) return;
    
    playSound("shift");
    
    // Get a new random piece type
    const newMatrix = pieces[Math.floor(Math.random() * pieces.length)];
    
    // Create a temporary piece with the new shape
    const tempPiece = {
      matrix: newMatrix,
      pos: { ...currentPiece.pos }
    };
    
    // Check if the new shape fits in the current position
    if (!collide(grid, tempPiece)) {
      // If it fits, use the new shape
      currentPiece.matrix = newMatrix;
    } else {
      // If it doesn't fit, try to adjust position
      const originalX = tempPiece.pos.x;
      let offset = 1;
      let fitted = false;
      
      // Try moving left and right to find a valid position
      while (offset <= 3 && !fitted) {
        // Try moving right
        tempPiece.pos.x = originalX + offset;
        if (!collide(grid, tempPiece)) {
          currentPiece.matrix = newMatrix;
          currentPiece.pos.x = tempPiece.pos.x;
          fitted = true;
        } else {
          // Try moving left
          tempPiece.pos.x = originalX - offset;
          if (!collide(grid, tempPiece)) {
            currentPiece.matrix = newMatrix;
            currentPiece.pos.x = tempPiece.pos.x;
            fitted = true;
          }
        }
        offset++;
      }
      
      // If still can't fit, try moving up
      if (!fitted) {
        tempPiece.pos.x = originalX;
        tempPiece.pos.y = currentPiece.pos.y - 1;
        if (!collide(grid, tempPiece)) {
          currentPiece.matrix = newMatrix;
          currentPiece.pos.y = tempPiece.pos.y;
          fitted = true;
        }
      }
      
    }
    
    // Consume one shift chance
    shiftChances--;
    
    // Show visual feedback
    showShiftFeedback();
  }
  function showShiftFeedback() {
    const div = document.createElement("div");
    div.className = "combo-popup";
    div.innerHTML = `ðŸ”„ Shape Shifted! (${shiftChances} left)`;
    div.style.color = "#FFD700";
    div.style.fontSize = "18px";
    document.body.appendChild(div);
    
    const rect = canvas.getBoundingClientRect();
    div.style.left = `${rect.left + canvas.width / 2 - 100}px`;
    div.style.top = `${rect.top + 100}px`;
    
    setTimeout(() => div.remove(), 1500);
  }
  // ADD THESE MISSING FUNCTIONS:
  function playSound(soundName) {
    if (sounds[soundName]) {
      sounds[soundName].currentTime = 0;
      sounds[soundName].play().catch(e => console.log("Sound play failed:", e));
    }
  }
  function playerMove(dir) {
    currentPiece.pos.x += dir;
    if (collide(grid, currentPiece)) {
      currentPiece.pos.x -= dir;
    } else {
      playSound("move");
    }
  }
  function playerRotate() {
    const pos = currentPiece.pos.x;
    let offset = 1;
    const originalMatrix = currentPiece.matrix;
    currentPiece.matrix = rotate(currentPiece.matrix);
    
    while (collide(grid, currentPiece)) {
      currentPiece.pos.x += offset;
      offset = -(offset + (offset > 0 ? 1 : -1));
      if (offset > currentPiece.matrix[0].length) {
        currentPiece.matrix = originalMatrix;
        currentPiece.pos.x = pos;
        return;
      }
    }
    playSound("rotate");
  }

    function showLevelUp(level) {
      const levelText = document.createElement('div');
      levelText.textContent = `LEVEL UP! Level ${level}`;
      levelText.style.textAlign = 'center';
      levelText.style.position = 'absolute';
      levelText.style.top = '50%';
      levelText.style.left = '50%';
      levelText.style.transform = 'translate(-50%, -50%)';
      levelText.style.fontSize = '20px';
      levelText.style.fontWeight = 'bold';
      levelText.style.color = '#FFD700';
      levelText.style.padding = '6px 12px';
      levelText.style.background = 'rgba(0,0,0,0.6)';
      levelText.style.border = '2px solid #FFF';
      levelText.style.borderRadius = '10px';
      levelText.style.zIndex = '10';
      levelText.style.opacity = '0';
      levelText.style.transition = 'opacity 0.3s ease, transform 0.6s ease';

      const gameArea = document.getElementById('game-area');
      gameArea.appendChild(levelText);

      requestAnimationFrame(() => {
        levelText.style.opacity = '1';
        levelText.style.transform = 'translate(-50%, -60%) scale(1.2)';
      });

      setTimeout(() => {
        levelText.style.opacity = '0';
        levelText.style.transform = 'translate(-50%, -80%) scale(0.9)';
        setTimeout(() => levelText.remove(), 400);
      }, 1200);

      
    }

    function getDropInterval(level) {
  // Gradual increase in speed per level, minimum 100ms
  return Math.max(100, Math.floor(1000 / (1 + (level - 1) * 0.12)));
}

    // UPDATED: Fix the initGame function to use the new system
    function initGame() {
  // Initialize level bar references
  levelBarElem = document.getElementById("xp-bar-fill");
  levelTextElem = document.getElementById("xp-label");

  // ✅ RESET BOTH LEVEL SYSTEMS FOR NEW GAME
  currentLevel = 1;
  levelProgress = 0;
  level = 1; // Keep in sync

  // ✅ Reset Random Challenge System
  challengePool = ["fast", "rotate", "flip", "preview", "wobble", "glitch"];
  challengePool.sort(() => Math.random() - 0.5); // Shuffle
  challengeTriggeredLevels.length = 0;
  challengeActive = false;
  canRotate = true;
  flippedControls = false;
  showPreview = true;

  const gameArea = document.getElementById("game-area");
  if (gameArea) {
    gameArea.classList.remove("shake");
  }

  saveLevelData();
  updateLevelBar();


      grid = createMatrix(COLS, ROWS);
      score = 0;
      lines = 0;
      combo = 0;
      dropInterval = 1000;
      originalDropInterval = 1000;
      dropCounter = 0;
      gameOver = false;
      paused = false;
      gameStarted = true;
      canHold = true;
      heldPiece = null;
      shiftChances = 2;
      particles = [];
      shockwaveBlocks = [];
      
      // ✅ Reset Challenge System
if (typeof challengeTriggeredLevels === "undefined") {
  challengeTriggeredLevels = [];
}
challengeTriggeredLevels.length = 0;
challengeActive = false;
canRotate = true;
flippedControls = false;
showPreview = true;
document.body.classList.remove("shake"); // ensure wobble stops

      // Reset powerup system
      powerups = [];
      activePowerups = [];
      powerupParticles = [];
      nextPowerupScore = 1500;
      gameStartTime = Date.now();
      lastPowerupTime = Date.now();
      ghostModeRemaining = 0;
      slowTimeRemaining = 0;
      bombMode = false;
      
      currentPiece = createPiece();
      nextPiece = createPiece();
      
gameOverElem.style.display = 'none';
updateScore();

if (showPreview) {
  drawPreview();
} else {
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
}

drawHold();
      
      sounds.bgm.play().catch(e => console.log("BGM play failed:", e));
    }

    function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 🔲 Grid lines
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * BLOCK_SIZE, 0);
    ctx.lineTo(x * BLOCK_SIZE, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * BLOCK_SIZE);
    ctx.lineTo(canvas.width, y * BLOCK_SIZE);
    ctx.stroke();
  }

  // 🔲 Grid blocks
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x] !== 0) {
        const isShockwaveBlock = shockwaveBlocks.some(block =>
          block.x === x && block.y === y && Date.now() >= block.startTime
        );
        if (!isShockwaveBlock) {
          if (document.getElementById("game-area").classList.contains("glitching")) {
            ctx.fillStyle = `hsl(${Math.random() * 360}, 100%, 60%)`;
          } else {
            ctx.fillStyle = colors[grid[y][x]];
          }
          ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
          ctx.strokeStyle = '#000';
          ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
        }
      }
    }
  }

  // 🔷 Effects
  updateShockwaveBlocks();
  drawParticles();
  drawPowerupParticles();
  drawPowerupUI();
  if (bombMode) showBombOverlay();
  if (pendingClear) processPendingClear();

  // 🟣 Ghost piece
  if (currentPiece && !gameOver) {
    drawGhostPiece(currentPiece);
  }

  // 🔥 Main falling piece glow
  if (currentPiece && !gameOver) {
    const pulse = 10 + Math.sin(Date.now() / 120) * 6;
    ctx.save();
    ctx.shadowColor = colors[currentPiece.colorIndex || 1] || '#fff';
    ctx.shadowBlur = pulse;
    drawMatrix(currentPiece.matrix, currentPiece.pos, ctx);
    ctx.restore();
  }

  // ⚡ Glitch Trail
  if (challengeActive && currentChallengeType === "glitch" && currentPiece) {
  const trailOpacity = 0.35;
  const maxTrail = 5; // Increase for more distortion
  for (let i = 1; i <= maxTrail; i++) {
    const jitterX = (Math.random() - 0.5) * 1.5; // Sideways jitter
    const jitterY = i * 1.8 + (Math.random() - 0.5); // Vertical trail jitter
    ctx.save();
    ctx.globalAlpha = trailOpacity / i;
    ctx.fillStyle = `hsl(${Math.random() * 360}, 100%, 60%)`;
    drawMatrix(
      currentPiece.matrix,
      { x: currentPiece.pos.x + jitterX, y: currentPiece.pos.y + jitterY },
      ctx
    );
    ctx.restore();
  }
  ctx.globalAlpha = 1.0;
}


  // 🔺 Teleport Flicker
  if (challengeActive && currentChallengeType === "glitch" && currentPiece && Math.random() < 0.1) {
    const flickerY = 1 + Math.random(); // Float at top
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.shadowBlur = 0;
    drawMatrix(currentPiece.matrix, { x: currentPiece.pos.x, y: flickerY }, ctx);
    ctx.restore();
  }

  // ⏸️ Pause overlay
  if (paused && gameStarted) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
  }
}



    function update(time = 0) {
      if (!gameStarted || gameOver) {
        requestAnimationFrame(update);
        return;
      }
      
      if (!paused) {
        const deltaTime = time - lastTime;
        lastTime = time;
        
        // Update powerup effects
        updatePowerupEffects(deltaTime);
        
        dropCounter += deltaTime;
// Prevent playerDrop only if there's a reason (like piece is null)
if (currentPiece && dropInterval > 0 && dropCounter > dropInterval) {
  playerDrop();
}
        
        // Check for powerup triggers
        checkPowerupTriggers();
      }
      
      draw();
      requestAnimationFrame(update);
    }

  // EVENT LISTENERS
document.addEventListener('keydown', (e) => {
  if (!gameStarted || gameOver) return;

  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      if (!paused) {
        flippedControls ? playerMove(1) : playerMove(-1);
      }
      break;

    case 'ArrowRight':
      e.preventDefault();
      if (!paused) {
        flippedControls ? playerMove(-1) : playerMove(1);
      }
      break;

    case 'ArrowDown':
      e.preventDefault();
      if (!paused) playerDrop();
      break;

    case 'ArrowUp':
      e.preventDefault();
      if (!paused && canRotate) playerRotate();
      break;

    case ' ':
      e.preventDefault();
      document.activeElement.blur();
      if (!paused && !gameOver) hardDrop();
      break;

    case 'c':
    case 'C':
      e.preventDefault();
      if (!paused) holdPiece();
      break;

    case 'p':
    case 'P':
      e.preventDefault();
      paused = !paused;
      if (paused) {
        sounds.bgm.pause();
      } else {
        sounds.bgm.play().catch(e => console.log("BGM resume failed:", e));
      }
      break;

    case '1':
    case '2':
    case '3':
    case '4':
      e.preventDefault();
      if (!paused) usePowerup(Number(e.key) - 1);
      break;

    case 'Shift':
      e.preventDefault();
      if (!paused) shiftPiece();
      break;
  }
});


  // Canvas click handler for bomb powerup
  canvas.addEventListener('click', (e) => {
    if (!bombMode) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    handleBombClick(x, y);
  });
  // Game control buttons
  document.addEventListener('DOMContentLoaded', function() {
      document.getElementById('startBtn').addEventListener('click', () => {
          playSound("button");
          
          // Hide loading screen
          document.getElementById('loading-screen').style.display = 'none';
          
          // Show game container
          document.querySelector('.container').style.display = 'flex';
          
          // Initialize game
          initGame();
      });
  });
  document.getElementById('restartBtn').addEventListener('click', () => {
    playSound("button");
    sounds.bgm.pause();
    sounds.bgm.currentTime = 0;
    initGame();
  });
  // Theme toggle
  // Theme toggle - FIXED VERSION
  themeToggleBtn.addEventListener('click', () => {
    playSound("button");
    
    // Toggle between light and dark themes
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // Update button icon with proper emojis
    themeToggleBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    
    // Optional: Save theme preference to localStorage
    localStorage.setItem('theme', newTheme);
  });

  // UPDATED: Fix the DOMContentLoaded event listener
  document.addEventListener('DOMContentLoaded', function() {
      // Get saved theme or default to light
      const savedTheme = localStorage.getItem('theme') || 'light';
      
      // Apply the theme
      document.documentElement.setAttribute('data-theme', savedTheme);
      
      // Set initial button icon
      themeToggleBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

      // ✅ LEVEL BAR REFERENCES AND LOAD
      levelBarElem = document.getElementById("xp-bar-fill");
      levelTextElem = document.getElementById("xp-label");
      loadLevelData();
      updateLevelBar();
      
      // Your existing loading screen code...
      const loadingBar = document.getElementById('loading-bar');
      const startBtn = document.getElementById('startBtn');
      const gameContainer = document.querySelector('.container');
    
      startBtn.style.display = 'none';
      startBtn.style.opacity = '0';
      let progress = 0;
      const loadingInterval = setInterval(() => {
          progress += Math.random() * 10;
          if (progress >= 100) {
              progress = 100;
              loadingBar.style.width = progress + '%';
              clearInterval(loadingInterval);
              startBtn.style.display = 'block';
              void startBtn.offsetWidth;
              startBtn.style.opacity = '1';
          } else {
              loadingBar.style.width = progress + '%';
          }
      }, 100);
      
      startBtn.addEventListener('click', () => {
          document.getElementById('loading-screen').style.display = 'none';
          gameContainer.style.display = 'flex';
          initGame();
      });
  });

  lastTime = 0;
  update();
