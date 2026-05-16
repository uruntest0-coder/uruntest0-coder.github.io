// ==========================================
// KUSAURA - CORE LOGIC
// ==========================================

// Global state
let myElo = 1000;
let baseOnline = 1487;
let isDev = window.location.protocol === 'file:';

// Initialize UI
document.addEventListener('DOMContentLoaded', () => {
    try {
        lucide.createIcons();
    } catch(e) { console.error("Lucide error:", e); }
});

// Toast System
function showToast(message, type="info") {
    const container = document.getElementById('toast-container');
    if (!container) return;
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
    const els = ['dashboard-elo', 'card-elo', 'arena-local-elo'];
    els.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            if(id === 'arena-local-elo') el.innerText = `ELO: ${myElo}`;
            else el.innerText = myElo;
        }
    });
}

// Dynamic Counter
setInterval(() => {
    baseOnline += Math.floor(Math.random() * 11) - 5;
    if (baseOnline < 1400) baseOnline = 1400;
    const text = `${baseOnline} ONLINE`;
    ['online-count-1', 'online-count-2'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerText = text;
    });
}, 3500);

// ==========================================
// ROUTER
// ==========================================
window.navigate = function(viewId) {
    console.log("Navigate called for:", viewId);
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        if (v.id === 'view-battle') {
            v.style.display = 'none';
        } else {
            v.classList.add('hidden');
        }
    });
    
    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        if (viewId === 'battle') {
            target.style.display = 'flex';
            setTimeout(() => target.classList.add('active'), 10);
        } else {
            target.classList.remove('hidden');
            target.classList.add('active');
        }
    }
    
    if (viewId === 'camera-check') {
        startRealCameraCheck();
    } else {
        stopCameraCheck();
    }
}

// ==========================================
// CAMERA CHECK LOGIC (MEDIAPIPE)
// ==========================================
let ccCamera = null, ccFaceMesh = null, ccStage = 0;
let ccBlinkCount = 0, ccBlinkState = false;

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
    if (!video || !canvas) return;
    
    const ctx = canvas.getContext('2d');
    const statusText = document.getElementById('cam-status-text');
    const actionBadge = document.getElementById('action-badge');
    const progressBar = document.getElementById('progress-bar');
    const scannerLine = document.getElementById('scanner-line');
    
    ccStage = 1; 
    ccBlinkCount = 0; 
    progressBar.style.width = '0%';
    
    // Reset Badge
    actionBadge.innerHTML = '<i data-lucide="scan-face" class="w-5 h-5"></i> ALIGN FACE';
    actionBadge.className = "bg-black/80 backdrop-blur-md border border-white/20 text-white font-logo text-lg px-8 py-3 rounded-xl uppercase tracking-widest shadow-xl flex items-center gap-2";
    actionBadge.parentElement.classList.remove('hidden');
    if(scannerLine) scannerLine.classList.remove('hidden');
    lucide.createIcons();
    
    ['1','2','3','4'].forEach(id => {
        const el = document.getElementById(`step-${id}`);
        if(el) el.className = (id === '1') ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]' : 'text-[#4a4759]';
    });
    
    statusText.innerText = "LOADING AI..."; 
    statusText.style.display = 'flex';

    try {
        ccFaceMesh = new FaceMesh({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
        ccFaceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        
        let lastText = "";
        const setBadge = (text, isSuccess=false) => {
            if (lastText !== text) {
                actionBadge.innerHTML = text;
                if(isSuccess) {
                    actionBadge.classList.replace('bg-black/80', 'bg-green-600/90');
                    actionBadge.classList.replace('border-white/20', 'border-green-400');
                }
                lucide.createIcons();
                lastText = text;
            }
        };

        ccFaceMesh.onResults((results) => {
            statusText.style.display = 'none';
            ctx.save(); 
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                const landmarks = results.multiFaceLandmarks[0];
                
                if (typeof FACEMESH_TESSELATION !== 'undefined') {
                    drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {color: 'rgba(34, 211, 238, 0.15)', lineWidth: 0.5});
                    drawConnectors(ctx, landmarks, FACEMESH_RIGHT_EYE, {color: '#22d3ee', lineWidth: 1});
                    drawConnectors(ctx, landmarks, FACEMESH_LEFT_EYE, {color: '#22d3ee', lineWidth: 1});
                }
                
                // Process Liveness
                if (ccStage === 1) {
                    setBadge('<i data-lucide="scan-face" class="w-5 h-5"></i> HOLD STILL');
                    progressBar.style.width = '25%';
                    ccStage = 1.5; // lock
                    setTimeout(() => { 
                        ccStage = 2; 
                        document.getElementById('step-2').className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]'; 
                    }, 1500);
                }
                else if (ccStage === 2) {
                    setBadge('<i data-lucide="eye" class="w-5 h-5"></i> BLINK NOW');
                    progressBar.style.width = '50%';
                    // Ear detection
                    const lDist = Math.abs(landmarks[159].y - landmarks[145].y);
                    const rDist = Math.abs(landmarks[386].y - landmarks[374].y);
                    const isBlinking = (lDist < 0.01 && rDist < 0.01);
                    if (isBlinking && !ccBlinkState) ccBlinkCount++;
                    ccBlinkState = isBlinking;
                    
                    if (ccBlinkCount >= 1) { 
                        ccStage = 3; 
                        document.getElementById('step-3').className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]'; 
                    }
                }
                else if (ccStage === 3) {
                    setBadge('<i data-lucide="refresh-cw" class="w-5 h-5"></i> TURN HEAD LEFT/RIGHT');
                    progressBar.style.width = '75%';
                    const nx = landmarks[1].x;
                    if (nx < 0.40 || nx > 0.60) { 
                        ccStage = 4; 
                        document.getElementById('step-4').className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]'; 
                    }
                }
                else if (ccStage === 4) {
                    setBadge('<i data-lucide="check-circle" class="w-5 h-5"></i> VERIFIED', true);
                    progressBar.style.width = '100%'; 
                    if(scannerLine) scannerLine.classList.add('hidden');
                    ccStage = 5; 
                    setTimeout(() => { navigate('menu'); }, 1500);
                }
                
            } else {
                setBadge('<i data-lucide="alert-triangle" class="w-5 h-5 text-red-500"></i> FACE NOT DETECTED');
            }
            ctx.restore();
        });

        ccCamera = new Camera(video, {
            onFrame: async () => {
                if(canvas.width !== video.videoWidth) { 
                    canvas.width = video.videoWidth; 
                    canvas.height = video.videoHeight; 
                }
                await ccFaceMesh.send({image: video});
            }, 
            width: 640, height: 480
        });
        
        await ccCamera.start();
        
    } catch (e) { 
        console.error("Camera Check Error:", e);
        statusText.innerText = "CAMERA ERROR / BLOCKED"; 
    }
}

// ==========================================
// SUPABASE & MULTIPLAYER
// ==========================================
let supabase = null, arenaChannel = null, myPeerId = null, peer = null;
const SUPABASE_URL = 'https://fumhnfdozcjzyvgwirne.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1bWhuZmRvemNqenl2Z3dpcm5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MjA1MjksImV4cCI6MjA5NDQ5NjUyOX0.pYr9dRij0B5weGjdgAtU9oKCv7wI1e4Z2jxq6gSbZws';

// Try loading Supabase and PeerJS safely so it doesn't crash the whole app if blocked
setTimeout(() => {
    try {
        if(window.supabase) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            arenaChannel = supabase.channel('global_arena', { config: { broadcast: { self: false } } });
        }
        if(window.Peer) {
            peer = new Peer({ debug: 1 });
            peer.on('open', id => myPeerId = id);
            peer.on('error', err => console.log("PeerJS Error:", err.type));
            
            // Handle incoming WebRTC Calls
            peer.on('call', call => {
                if (isSearching || currentPrivateChannel) {
                    stopSearching();
                    call.answer(arenaStream);
                    currentCall = call;
                    call.on('stream', remoteStream => {
                        const vid = document.getElementById('arena-stranger-vid');
                        if(vid) vid.srcObject = remoteStream;
                        document.getElementById('arena-stranger-elo').innerText = "CONNECTED";
                        startLiveMogScan();
                    });
                } else {
                    call.close();
                }
            });
            
            peer.on('connection', conn => setupDataConnection(conn));
            
            // If Supabase loaded, listen for Matchmaking
            if(arenaChannel) {
                arenaChannel.on('broadcast', { event: 'find_match' }, ({ payload }) => {
                    if (isSearching && myPeerId > payload.peerId) {
                        connectToOpponent(payload.peerId);
                    }
                }).subscribe();
            }
        }
    } catch(e) {
        console.error("Multiplayer initialization failed:", e);
    }
}, 500);


// ==========================================
// PRIVATE ROOM LOGIC
// ==========================================
let currentPrivateChannel = null;

function generateRoomCode() {
    document.getElementById('private-room-join').classList.add('hidden');
    document.getElementById('private-room-generated').classList.remove('hidden');
    document.getElementById('generated-code').value = Math.random().toString(36).substring(2, 8).toUpperCase();
}

function copyRoomCode() {
    const codeInput = document.getElementById('generated-code');
    codeInput.select(); 
    codeInput.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(codeInput.value)
        .then(() => showToast("CODE COPIED TO CLIPBOARD"))
        .catch(() => showToast("FAILED TO COPY", "error"));
}

function joinPrivateRoom(isHost) {
    let code = isHost ? document.getElementById('generated-code').value : document.getElementById('room-code-input').value.trim().toUpperCase();
    if(code.length < 3) return showToast("INVALID ROOM CODE", "error");
    if(!isHost) document.getElementById('room-code-input').value = '';
    
    showToast(`JOINING ROOM: ${code}`);
    setTimeout(() => startArenaMatch(true, code, isHost), 500);
}

// ==========================================
// 1V1 ARENA
// ==========================================
let arenaStream = null, isSearching = false, arenaSearchInterval = null;
let currentCall = null, currentConn = null, myArenaScore = null, opponentArenaScore = null;

async function startArenaMatch(isPrivate = false, code = null, isHost = false) {
    if(!peer || !supabase) { showToast("MULTIPLAYER OFFLINE", "error"); return; }
    if(!myPeerId) { showToast("CONNECTING TO SERVER...", "error"); return; }
    
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
            if (isHost) connectToOpponent(payload.peerId);
        }).subscribe((status) => {
            if (status === 'SUBSCRIBED' && !isHost) {
                currentPrivateChannel.send({type: 'broadcast', event: 'join_room', payload: {peerId: myPeerId}});
            }
        });
    } else {
        isSearching = true;
        document.getElementById('arena-stranger-elo').innerText = "SEARCHING REAL PLAYERS...";
        arenaSearchInterval = setInterval(() => {
            if(isSearching) arenaChannel.send({ type: 'broadcast', event: 'find_match', payload: { peerId: myPeerId } });
        }, 2000);
        arenaChannel.send({ type: 'broadcast', event: 'find_match', payload: { peerId: myPeerId } });
    }
}

function connectToOpponent(opponentPeerId) {
    stopSearching();
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
            if(myArenaScore && opponentArenaScore) finalizeMatch();
        }
    });
}

function startLiveMogScan() {
    myArenaScore = null;
    opponentArenaScore = null;
    document.getElementById('btn-next-match').classList.add('hidden'); 
    
    setTimeout(() => {
        myArenaScore = ((myElo / 200) + 2.0 + (Math.random() * 1.5 - 0.5)).toFixed(1);
        if (myArenaScore > 10.0) myArenaScore = 9.9;
        if (currentConn) currentConn.send({ type: 'score', score: myArenaScore });
        if(myArenaScore && opponentArenaScore) finalizeMatch();
    }, 3000);
}

function finalizeMatch() {
    const sScore = parseFloat(opponentArenaScore), mScore = parseFloat(myArenaScore);
    const iWon = mScore > sScore;

    document.getElementById('stranger-score').innerText = sScore.toFixed(1);
    document.getElementById('local-score').innerText = mScore.toFixed(1);

    const expected = 1 / (1 + Math.pow(10, (1000 - myElo) / 400)); 
    const sStatus = document.getElementById('stranger-status'), mStatus = document.getElementById('local-status');

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
    document.getElementById('stranger-score-overlay').style.opacity = '1'; document.getElementById('stranger-score-overlay').style.transform = 'scale(1)';
    document.getElementById('local-score-overlay').style.opacity = '1'; document.getElementById('local-score-overlay').style.transform = 'scale(1)';
    
    document.getElementById('btn-next-match').innerHTML = '<i data-lucide="play" class="w-4 h-4"></i> NEXT MATCH';
    document.getElementById('btn-next-match').classList.remove('hidden');
    lucide.createIcons();
}

function stopSearching() { isSearching = false; clearInterval(arenaSearchInterval); }

function exitArena() {
    stopSearching();
    if(currentCall) { currentCall.close(); currentCall = null; }
    if(currentConn) { currentConn.close(); currentConn = null; }
    if(currentPrivateChannel) { currentPrivateChannel.unsubscribe(); currentPrivateChannel = null; }
    if(arenaStream) { arenaStream.getTracks().forEach(t => t.stop()); arenaStream = null; }
    navigate('menu');
}

function resetArenaUI() {
    document.getElementById('stranger-score-overlay').style.opacity = '0'; document.getElementById('stranger-score-overlay').style.transform = 'scale(0.9)';
    document.getElementById('local-score-overlay').style.opacity = '0'; document.getElementById('local-score-overlay').style.transform = 'scale(0.9)';
    document.getElementById('arena-stranger-vid').srcObject = null;
    document.getElementById('btn-next-match').innerHTML = '<i data-lucide="x" class="w-4 h-4"></i> CANCEL SEARCH';
    document.getElementById('btn-next-match').classList.remove('hidden');
    lucide.createIcons();
}
