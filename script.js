// Initialize Lucide icons
lucide.createIcons();

// Simple Router
function navigate(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    
    // Specifically handle battle view display property
    if(viewId === 'battle') {
        document.getElementById('view-battle').style.display = 'flex';
        // Need brief delay to let display:flex apply before adding active for transitions
        setTimeout(() => {
            document.getElementById('view-battle').classList.add('active');
            document.getElementById('view-battle').classList.remove('hidden');
        }, 10);
    } else {
        document.getElementById('view-battle').classList.add('hidden');
        document.getElementById('view-battle').classList.remove('active');
        document.getElementById('view-battle').style.display = 'none';
        
        document.getElementById(`view-${viewId}`).classList.add('active');
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
    }
    
    if (viewId === 'camera-check') {
        startRealCameraCheck();
    } else {
        stopCameraCheck();
    }
}

// ==========================================
// MOCK STATE & DYNAMIC DATA
// ==========================================
let myElo = 1000;
let baseOnline = 1487;

// Dynamic Online Counter
setInterval(() => {
    let fluctuation = Math.floor(Math.random() * 11) - 5; // -5 to +5
    baseOnline += fluctuation;
    if (baseOnline < 1400) baseOnline = 1400; // Floor
    const text = `${baseOnline} ONLINE`;
    if(document.getElementById('online-count-1')) document.getElementById('online-count-1').innerText = text;
    if(document.getElementById('online-count-2')) document.getElementById('online-count-2').innerText = text;
}, 3500);

// Toast Notification System
function showToast(message, type="info") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `px-4 py-2 rounded shadow-lg text-xs font-bold uppercase tracking-widest text-white transform transition-all duration-300 translate-x-full ${type === 'error' ? 'bg-red-600' : 'bg-cyan-600'}`;
    toast.innerText = message;
    container.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full');
    });
    
    // Remove after 3s
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Update UI Elo
function updateUIElo() {
    document.getElementById('dashboard-elo').innerText = myElo;
    document.getElementById('card-elo').innerText = myElo;
    document.getElementById('arena-local-elo').innerText = `ELO: ${myElo}`;
}

// ==========================================
// CAMERA CHECK LOGIC (MEDIAPIPE)
// ==========================================
let ccCamera = null;
let ccFaceMesh = null;
let ccStage = 0; 
let ccBlinkState = false;
let ccBlinkCount = 0;

function stopCameraCheck() {
    if (ccCamera) { ccCamera.stop(); ccCamera = null; }
    const video = document.getElementById('webcam');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }
    if (ccFaceMesh) { ccFaceMesh.close(); ccFaceMesh = null; }
}

async function startRealCameraCheck() {
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('output_canvas');
    const ctx = canvas.getContext('2d');
    const statusText = document.getElementById('cam-status-text');
    const actionBadge = document.getElementById('action-badge');
    const progressBar = document.getElementById('progress-bar');
    const scannerLine = document.getElementById('scanner-line');
    
    // Reset State
    ccStage = 1;
    ccBlinkCount = 0;
    progressBar.style.width = '0%';
    actionBadge.innerHTML = '<i data-lucide="scan-face" class="w-5 h-5"></i> ALIGN FACE';
    actionBadge.parentElement.classList.remove('hidden');
    scannerLine.classList.remove('hidden');
    lucide.createIcons();
    
    document.getElementById('step-1').className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]';
    ['2','3','4'].forEach(id => document.getElementById(`step-${id}`).className = 'text-[#4a4759]');
    
    statusText.innerText = "LOADING AI...";
    statusText.style.display = 'flex';

    ccFaceMesh = new FaceMesh({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
    ccFaceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    
    ccFaceMesh.onResults((results) => {
        statusText.style.display = 'none';
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {color: 'rgba(34, 211, 238, 0.15)', lineWidth: 0.5});
            drawConnectors(ctx, landmarks, FACEMESH_RIGHT_EYE, {color: '#22d3ee'});
            drawConnectors(ctx, landmarks, FACEMESH_LEFT_EYE, {color: '#22d3ee'});
            drawConnectors(ctx, landmarks, FACEMESH_FACE_OVAL, {color: '#22d3ee'});
            processLiveness(landmarks, actionBadge, progressBar);
        } else {
            actionBadge.innerHTML = '<i data-lucide="alert-triangle" class="w-5 h-5 text-red-500"></i> FACE NOT DETECTED';
            lucide.createIcons();
        }
        ctx.restore();
    });

    ccCamera = new Camera(video, {
        onFrame: async () => {
            if(canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
            await ccFaceMesh.send({image: video});
        }, width: 640, height: 480
    });
    
    try { await ccCamera.start(); } catch (e) { statusText.innerText = "CAMERA ERROR"; }
}

function processLiveness(landmarks, actionBadge, progressBar) {
    if (ccStage === 1) {
        actionBadge.innerHTML = '<i data-lucide="scan-face" class="w-5 h-5"></i> HOLD STILL';
        lucide.createIcons();
        progressBar.style.width = '25%';
        setTimeout(() => {
            if (ccStage === 1) {
                ccStage = 2;
                document.getElementById('step-2').className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]';
            }
        }, 1500);
    }
    else if (ccStage === 2) {
        actionBadge.innerHTML = '<i data-lucide="eye" class="w-5 h-5"></i> BLINK NOW';
        lucide.createIcons();
        progressBar.style.width = '50%';
        
        const leftDist = Math.abs(landmarks[159].y - landmarks[145].y);
        const rightDist = Math.abs(landmarks[386].y - landmarks[374].y);
        const isBlinking = (leftDist < 0.012 && rightDist < 0.012);
        
        if (isBlinking && !ccBlinkState) ccBlinkCount++;
        ccBlinkState = isBlinking;
        
        if (ccBlinkCount >= 1) {
            ccStage = 3;
            document.getElementById('step-3').className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]';
        }
    }
    else if (ccStage === 4) { // Turn logic tweaked to Stage 4 for flow control
        actionBadge.innerHTML = '<i data-lucide="refresh-cw" class="w-5 h-5"></i> TURN HEAD LEFT/RIGHT';
        lucide.createIcons();
        progressBar.style.width = '75%';
        
        const noseX = landmarks[1].x;
        if (noseX < 0.40 || noseX > 0.60) {
            ccStage = 5;
            document.getElementById('step-4').className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]';
        }
    }
    else if (ccStage === 3) {
        // Debounce state 3 to 4
        setTimeout(() => { if(ccStage === 3) ccStage = 4; }, 500);
    }
    else if (ccStage === 5) {
        actionBadge.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i> VERIFIED';
        actionBadge.classList.replace('bg-black/80', 'bg-green-600/90');
        actionBadge.classList.replace('border-white/20', 'border-green-400');
        lucide.createIcons();
        progressBar.style.width = '100%';
        document.getElementById('scanner-line').classList.add('hidden');
        
        ccStage = 6;
        setTimeout(() => {
            navigate('menu');
            stopCameraCheck();
        }, 1500);
    }
}

// ==========================================
// 1V1 ARENA BATTLE LOGIC
// ==========================================
let arenaStream = null;
let arenaMatchTimeout = null;

const MOCK_STRANGERS = [
    { video: 'https://cdn.coverr.co/videos/coverr-a-man-looking-at-his-phone-5264/1080p.mp4', name: 'User_8921', elo: 1045, base: 6.5 },
    { video: 'https://cdn.coverr.co/videos/coverr-woman-looking-at-camera-and-smiling-2729/1080p.mp4', name: 'User_1142', elo: 1120, base: 7.8 },
    { video: 'https://cdn.coverr.co/videos/coverr-man-in-front-of-a-laptop-4485/1080p.mp4', name: 'User_5599', elo: 1300, base: 8.5 }
];

async function startArenaMatch(isPrivate = false) {
    navigate('battle');
    
    // UI Resets
    const sOverlay = document.getElementById('stranger-score-overlay');
    const mOverlay = document.getElementById('local-score-overlay');
    sOverlay.style.opacity = '0'; sOverlay.style.transform = 'scale(0.9)';
    mOverlay.style.opacity = '0'; mOverlay.style.transform = 'scale(0.9)';
    
    const sv = document.getElementById('arena-stranger-vid');
    sv.src = "";
    document.getElementById('arena-stranger-elo').innerText = isPrivate ? "WAITING..." : "SEARCHING...";
    
    document.getElementById('btn-next-match').innerHTML = '<i data-lucide="x" class="w-4 h-4"></i> CANCEL SEARCH';
    lucide.createIcons();

    // Start local camera if not started
    if (!arenaStream) {
        try {
            arenaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            document.getElementById('arena-local-vid').srcObject = arenaStream;
        } catch(e) {
            console.error("Camera required for arena", e);
        }
    }

    if(isPrivate) return; // If private, we just wait for a code logic (mocked to wait indefinitely)

    // Matchmaking Delay
    arenaMatchTimeout = setTimeout(() => {
        // Found Match
        const stranger = MOCK_STRANGERS[Math.floor(Math.random() * MOCK_STRANGERS.length)];
        sv.src = stranger.video;
        document.getElementById('arena-stranger-elo').innerText = `ELO: ${stranger.elo}`;
        
        document.getElementById('btn-next-match').innerHTML = '<i data-lucide="skip-forward" class="w-4 h-4"></i> SKIP MATCH';
        lucide.createIcons();

        // 3 Seconds Scan delay -> Results
        setTimeout(() => finalizeMatch(stranger), 3000);
    }, 1500 + Math.random() * 2000);
}

function finalizeMatch(stranger) {
    const strangerScore = (stranger.base + (Math.random() * 0.8 - 0.4)).toFixed(1);
    const myScore = (7.0 + (Math.random() * 1.5 - 0.5)).toFixed(1); // My mock base is 7.0
    const iWon = parseFloat(myScore) > parseFloat(strangerScore);

    // Apply Overlays
    const sOverlay = document.getElementById('stranger-score-overlay');
    const sScore = document.getElementById('stranger-score');
    const sStatus = document.getElementById('stranger-status');
    const mOverlay = document.getElementById('local-score-overlay');
    const mScore = document.getElementById('local-score');
    const mStatus = document.getElementById('local-status');

    sScore.innerText = strangerScore;
    mScore.innerText = myScore;

    if (iWon) {
        sStatus.innerText = "MOGGED";
        sStatus.className = "font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]";
        mStatus.innerText = "WINNER";
        mStatus.className = "font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.8)]";
        
        const eloGain = Math.round(32 * (1 - (1 / (1 + Math.pow(10, (stranger.elo - myElo) / 400)))));
        myElo += eloGain;
    } else {
        sStatus.innerText = "WINNER";
        sStatus.className = "font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.8)]";
        mStatus.innerText = "MOGGED";
        mStatus.className = "font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]";
        
        const eloLoss = Math.round(32 * (0 - (1 / (1 + Math.pow(10, (stranger.elo - myElo) / 400)))));
        myElo += eloLoss; // loss is negative
    }

    updateUIElo();

    sOverlay.style.opacity = '1'; sOverlay.style.transform = 'scale(1)';
    mOverlay.style.opacity = '1'; mOverlay.style.transform = 'scale(1)';

    document.getElementById('btn-next-match').innerHTML = '<i data-lucide="play" class="w-4 h-4"></i> NEXT MATCH';
    lucide.createIcons();
}

function exitArena() {
    clearTimeout(arenaMatchTimeout);
    if(arenaStream) {
        arenaStream.getTracks().forEach(t => t.stop());
        arenaStream = null;
    }
    navigate('menu');
}

function generateRoomCode() {
    document.getElementById('private-room-join').classList.add('hidden');
    document.getElementById('private-room-generated').classList.remove('hidden');
    
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    document.getElementById('generated-code').value = code;
}

function copyRoomCode() {
    const codeInput = document.getElementById('generated-code');
    codeInput.select();
    codeInput.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(codeInput.value).then(() => {
        showToast("CODE COPIED TO CLIPBOARD");
    }).catch(err => {
        showToast("FAILED TO COPY", "error");
    });
}

function joinPrivateRoom(isHost) {
    let code = "";
    if (isHost) {
        code = document.getElementById('generated-code').value;
    } else {
        code = document.getElementById('room-code-input').value.trim().toUpperCase();
        if(code.length < 3) {
            showToast("INVALID ROOM CODE", "error");
            return;
        }
        document.getElementById('room-code-input').value = '';
    }
    
    showToast(`JOINING ROOM: ${code}`);
    setTimeout(() => {
        startArenaMatch(true); // Open arena in waiting mode
    }, 800);
}
