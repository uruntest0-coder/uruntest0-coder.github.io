// Initialize Lucide icons
lucide.createIcons();

// ==========================================
// SUPABASE & PEERJS INITIALIZATION
// ==========================================
const SUPABASE_URL = 'https://fumhnfdozcjzyvgwirne.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1bWhuZmRvemNqenl2Z3dpcm5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MjA1MjksImV4cCI6MjA5NDQ5NjUyOX0.pYr9dRij0B5weGjdgAtU9oKCv7wI1e4Z2jxq6gSbZws';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Realtime channels
const arenaChannel = supabase.channel('global_arena', { config: { broadcast: { self: false } } });

let myPeerId = null;
const peer = new Peer({ debug: 1 });

peer.on('open', id => {
    myPeerId = id;
    console.log("My Peer ID:", myPeerId);
});

peer.on('error', err => {
    console.error("PeerJS Error:", err);
    showToast("CONNECTION ERROR", "error");
});

// Simple Router
function navigate(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    
    if(viewId === 'battle') {
        document.getElementById('view-battle').style.display = 'flex';
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
    
    if (viewId === 'camera-check') startRealCameraCheck();
    else stopCameraCheck();
}

// ==========================================
// MOCK STATE & DYNAMIC DATA
// ==========================================
let myElo = 1000;
let baseOnline = 1487;

setInterval(() => {
    let fluctuation = Math.floor(Math.random() * 11) - 5;
    baseOnline += fluctuation;
    if (baseOnline < 1400) baseOnline = 1400;
    const text = `${baseOnline} ONLINE`;
    if(document.getElementById('online-count-1')) document.getElementById('online-count-1').innerText = text;
    if(document.getElementById('online-count-2')) document.getElementById('online-count-2').innerText = text;
}, 3500);

function showToast(message, type="info") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `px-4 py-2 rounded shadow-lg text-xs font-bold uppercase tracking-widest text-white transform transition-all duration-300 translate-x-full ${type === 'error' ? 'bg-red-600' : 'bg-cyan-600'}`;
    toast.innerText = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove('translate-x-full'));
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function updateUIElo() {
    document.getElementById('dashboard-elo').innerText = myElo;
    document.getElementById('card-elo').innerText = myElo;
    document.getElementById('arena-local-elo').innerText = `ELO: ${myElo}`;
}

// ==========================================
// CAMERA CHECK LOGIC (MEDIAPIPE)
// ==========================================
let ccCamera = null, ccFaceMesh = null, ccStage = 0, ccBlinkState = false, ccBlinkCount = 0;

function stopCameraCheck() {
    if (ccCamera) { ccCamera.stop(); ccCamera = null; }
    const video = document.getElementById('webcam');
    if (video && video.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
    if (ccFaceMesh) { ccFaceMesh.close(); ccFaceMesh = null; }
}

async function startRealCameraCheck() {
    const video = document.getElementById('webcam'), canvas = document.getElementById('output_canvas');
    const ctx = canvas.getContext('2d'), statusText = document.getElementById('cam-status-text');
    const actionBadge = document.getElementById('action-badge'), progressBar = document.getElementById('progress-bar');
    
    ccStage = 1; ccBlinkCount = 0; progressBar.style.width = '0%';
    actionBadge.innerHTML = '<i data-lucide="scan-face" class="w-5 h-5"></i> ALIGN FACE';
    actionBadge.parentElement.classList.remove('hidden');
    document.getElementById('scanner-line').classList.remove('hidden');
    lucide.createIcons();
    
    document.getElementById('step-1').className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]';
    ['2','3','4'].forEach(id => document.getElementById(`step-${id}`).className = 'text-[#4a4759]');
    
    statusText.innerText = "LOADING AI..."; statusText.style.display = 'flex';

    ccFaceMesh = new FaceMesh({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
    ccFaceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    
    let lastBadgeText = "";
    function updateBadge(html) {
        if (lastBadgeText !== html) {
            actionBadge.innerHTML = html;
            lucide.createIcons();
            lastBadgeText = html;
        }
    }

    ccFaceMesh.onResults((results) => {
        statusText.style.display = 'none';
        ctx.save(); ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {color: 'rgba(34, 211, 238, 0.15)', lineWidth: 0.5});
            drawConnectors(ctx, landmarks, FACEMESH_RIGHT_EYE, {color: '#22d3ee'});
            drawConnectors(ctx, landmarks, FACEMESH_LEFT_EYE, {color: '#22d3ee'});
            processLiveness(landmarks, updateBadge, progressBar);
        } else {
            updateBadge('<i data-lucide="alert-triangle" class="w-5 h-5 text-red-500"></i> FACE NOT DETECTED');
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

let stage3Timer = null;

function processLiveness(landmarks, updateBadge, progressBar) {
    if (ccStage === 1) {
        updateBadge('<i data-lucide="scan-face" class="w-5 h-5"></i> HOLD STILL');
        progressBar.style.width = '25%';
        setTimeout(() => { if (ccStage === 1) { ccStage = 2; document.getElementById('step-2').className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]'; } }, 1500);
    }
    else if (ccStage === 2) {
        updateBadge('<i data-lucide="eye" class="w-5 h-5"></i> BLINK NOW');
        progressBar.style.width = '50%';
        const leftDist = Math.abs(landmarks[159].y - landmarks[145].y), rightDist = Math.abs(landmarks[386].y - landmarks[374].y);
        const isBlinking = (leftDist < 0.012 && rightDist < 0.012);
        if (isBlinking && !ccBlinkState) ccBlinkCount++;
        ccBlinkState = isBlinking;
        if (ccBlinkCount >= 1) { ccStage = 3; document.getElementById('step-3').className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]'; }
    }
    else if (ccStage === 4) {
        updateBadge('<i data-lucide="refresh-cw" class="w-5 h-5"></i> TURN HEAD LEFT/RIGHT');
        progressBar.style.width = '75%';
        const noseX = landmarks[1].x;
        if (noseX < 0.40 || noseX > 0.60) { ccStage = 5; document.getElementById('step-4').className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]'; }
    }
    else if (ccStage === 3) { 
        if(!stage3Timer) {
            stage3Timer = setTimeout(() => { if(ccStage === 3) ccStage = 4; stage3Timer = null; }, 500);
        }
    }
    else if (ccStage === 5) {
        updateBadge('<i data-lucide="check-circle" class="w-5 h-5"></i> VERIFIED');
        document.getElementById('action-badge').classList.replace('bg-black/80', 'bg-green-600/90'); 
        document.getElementById('action-badge').classList.replace('border-white/20', 'border-green-400');
        progressBar.style.width = '100%'; document.getElementById('scanner-line').classList.add('hidden');
        ccStage = 6; setTimeout(() => { navigate('menu'); stopCameraCheck(); }, 1500);
    }
}

// ==========================================
// PRIVATE ROOM LOGIC
// ==========================================
let currentPrivateChannel = null;

function generateRoomCode() {
    document.getElementById('private-room-join').classList.add('hidden');
    document.getElementById('private-room-generated').classList.remove('hidden');
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    document.getElementById('generated-code').value = code;
}

function copyRoomCode() {
    const codeInput = document.getElementById('generated-code');
    codeInput.select(); codeInput.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(codeInput.value).then(() => showToast("CODE COPIED TO CLIPBOARD")).catch(() => showToast("FAILED TO COPY", "error"));
}

function joinPrivateRoom(isHost) {
    let code = isHost ? document.getElementById('generated-code').value : document.getElementById('room-code-input').value.trim().toUpperCase();
    if(code.length < 3) return showToast("INVALID ROOM CODE", "error");
    if(!isHost) document.getElementById('room-code-input').value = '';
    
    showToast(`JOINING ROOM: ${code}`);
    setTimeout(() => { startArenaMatch(true, code, isHost); }, 500);
}

// ==========================================
// 1V1 ARENA (REAL MULTIPLAYER WEBRTC)
// ==========================================
let arenaStream = null;
let isSearching = false;
let arenaSearchInterval = null;
let currentCall = null;
let currentConn = null;
let myArenaScore = null;
let opponentArenaScore = null;

// Listening for public arena matchmaking
arenaChannel.on('broadcast', { event: 'find_match' }, ({ payload }) => {
    if (isSearching) {
        console.log("Found opponent in matchmaking:", payload.peerId);
        // Tie-breaker to prevent both calling each other simultaneously
        if (myPeerId > payload.peerId) {
            connectToOpponent(payload.peerId);
        }
    }
}).subscribe();

// Handle incoming WebRTC Calls
peer.on('call', call => {
    if (isSearching || currentPrivateChannel) {
        console.log("Answering incoming call from", call.peer);
        stopSearching();
        
        call.answer(arenaStream);
        currentCall = call;
        
        call.on('stream', remoteStream => {
            document.getElementById('arena-stranger-vid').srcObject = remoteStream;
            document.getElementById('arena-stranger-elo').innerText = "CONNECTED";
            startLiveMogScan();
        });
    } else {
        console.log("Busy, rejecting call");
        call.close();
    }
});

// Handle incoming Data Connection (for syncing scores)
peer.on('connection', conn => {
    setupDataConnection(conn);
});

async function startArenaMatch(isPrivate = false, code = null, isHost = false) {
    if(!myPeerId) { showToast("WAITING FOR PEER ID...", "error"); return; }
    navigate('battle');
    resetArenaUI();

    try {
        if (!arenaStream) {
            arenaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            document.getElementById('arena-local-vid').srcObject = arenaStream;
        }
    } catch(e) {
        console.error("Camera required for arena", e);
        showToast("CAMERA PERMISSION DENIED", "error");
        return;
    }

    if(isPrivate) {
        document.getElementById('arena-stranger-elo').innerText = isHost ? "WAITING FOR FRIEND..." : "CONNECTING TO HOST...";
        currentPrivateChannel = supabase.channel(`room_${code}`, { config: { broadcast: { self: false } } });
        
        currentPrivateChannel.on('broadcast', {event: 'join_room'}, ({payload}) => {
            if (isHost) {
                console.log("Friend joined! Connecting to:", payload.peerId);
                connectToOpponent(payload.peerId);
            }
        }).subscribe((status) => {
            if (status === 'SUBSCRIBED' && !isHost) {
                // Tell host I am here
                currentPrivateChannel.send({type: 'broadcast', event: 'join_room', payload: {peerId: myPeerId}});
            }
        });
    } else {
        isSearching = true;
        document.getElementById('arena-stranger-elo').innerText = "SEARCHING REAL PLAYERS...";
        arenaSearchInterval = setInterval(() => {
            if(isSearching) arenaChannel.send({ type: 'broadcast', event: 'find_match', payload: { peerId: myPeerId } });
        }, 2000);
        // Trigger one immediately
        arenaChannel.send({ type: 'broadcast', event: 'find_match', payload: { peerId: myPeerId } });
    }
}

function connectToOpponent(opponentPeerId) {
    stopSearching();
    console.log("Initiating call to", opponentPeerId);
    
    const call = peer.call(opponentPeerId, arenaStream);
    currentCall = call;
    
    call.on('stream', remoteStream => {
        document.getElementById('arena-stranger-vid').srcObject = remoteStream;
        document.getElementById('arena-stranger-elo').innerText = "CONNECTED";
        
        const conn = peer.connect(opponentPeerId);
        setupDataConnection(conn);
        startLiveMogScan();
    });
}

function setupDataConnection(conn) {
    currentConn = conn;
    conn.on('data', data => {
        if (data.type === 'score') {
            opponentArenaScore = data.score;
            checkMatchEnd();
        }
    });
}

function startLiveMogScan() {
    myArenaScore = null;
    opponentArenaScore = null;
    document.getElementById('btn-next-match').classList.add('hidden'); // Hide skip during scan
    
    // Simulate AI scan taking 3 seconds, then generate a realistic score based on current Elo
    setTimeout(() => {
        const base = (myElo / 200) + 2.0; // Dynamic base score based on ELO
        myArenaScore = (base + (Math.random() * 1.5 - 0.5)).toFixed(1);
        if (myArenaScore > 10.0) myArenaScore = 9.9;
        
        if (currentConn) currentConn.send({ type: 'score', score: myArenaScore });
        checkMatchEnd();
    }, 3000);
}

function checkMatchEnd() {
    if (myArenaScore && opponentArenaScore) {
        finalizeMatch();
    }
}

function finalizeMatch() {
    const sScore = parseFloat(opponentArenaScore);
    const mScore = parseFloat(myArenaScore);
    const iWon = mScore > sScore;

    // Apply Overlays
    const sOverlay = document.getElementById('stranger-score-overlay');
    const sScoreEl = document.getElementById('stranger-score');
    const sStatus = document.getElementById('stranger-status');
    const mOverlay = document.getElementById('local-score-overlay');
    const mScoreEl = document.getElementById('local-score');
    const mStatus = document.getElementById('local-status');

    sScoreEl.innerText = sScore.toFixed(1);
    mScoreEl.innerText = mScore.toFixed(1);

    // K-Factor 32 calculation
    const expected = 1 / (1 + Math.pow(10, (1000 - myElo) / 400)); // Mocking opponent Elo as 1000 for now since we didn't sync Elos
    
    if (iWon) {
        sStatus.innerText = "MOGGED"; sStatus.className = "font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]";
        mStatus.innerText = "WINNER"; mStatus.className = "font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.8)]";
        myElo += Math.round(32 * (1 - expected));
    } else if (mScore < sScore) {
        sStatus.innerText = "WINNER"; sStatus.className = "font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.8)]";
        mStatus.innerText = "MOGGED"; mStatus.className = "font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]";
        myElo += Math.round(32 * (0 - expected));
    } else {
        sStatus.innerText = "DRAW"; sStatus.className = "font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]";
        mStatus.innerText = "DRAW"; mStatus.className = "font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]";
    }

    updateUIElo();
    sOverlay.style.opacity = '1'; sOverlay.style.transform = 'scale(1)';
    mOverlay.style.opacity = '1'; mOverlay.style.transform = 'scale(1)';

    document.getElementById('btn-next-match').innerHTML = '<i data-lucide="play" class="w-4 h-4"></i> NEXT MATCH';
    document.getElementById('btn-next-match').classList.remove('hidden');
    lucide.createIcons();
}

function stopSearching() {
    isSearching = false;
    clearInterval(arenaSearchInterval);
}

function exitArena() {
    stopSearching();
    if(currentCall) { currentCall.close(); currentCall = null; }
    if(currentConn) { currentConn.close(); currentConn = null; }
    if(currentPrivateChannel) { currentPrivateChannel.unsubscribe(); currentPrivateChannel = null; }
    
    if(arenaStream) {
        arenaStream.getTracks().forEach(t => t.stop());
        arenaStream = null;
    }
    navigate('menu');
}

function resetArenaUI() {
    const sOverlay = document.getElementById('stranger-score-overlay');
    const mOverlay = document.getElementById('local-score-overlay');
    sOverlay.style.opacity = '0'; sOverlay.style.transform = 'scale(0.9)';
    mOverlay.style.opacity = '0'; mOverlay.style.transform = 'scale(0.9)';
    document.getElementById('arena-stranger-vid').srcObject = null;
    document.getElementById('btn-next-match').innerHTML = '<i data-lucide="x" class="w-4 h-4"></i> CANCEL SEARCH';
    document.getElementById('btn-next-match').classList.remove('hidden');
    lucide.createIcons();
}
