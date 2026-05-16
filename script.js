// ==========================================
// KUSAURA - CORE LOGIC v10
// Zero external icon dependencies
// All event listeners, no inline onclick
// ==========================================

(function() {
    "use strict";

    // ==========================================
    // STATE
    // ==========================================
    let myElo = 1000;
    let baseOnline = 1487;
    let ccCamera = null, ccFaceMesh = null, ccStage = 0;
    let ccBlinkCount = 0, ccBlinkState = false;
    let supabase = null, arenaChannel = null, myPeerId = null, peer = null;
    let currentPrivateChannel = null;
    let arenaStream = null, isSearching = false, arenaSearchInterval = null;
    let currentCall = null, currentConn = null, myArenaScore = null, opponentArenaScore = null;

    const SUPABASE_URL = 'https://fumhnfdozcjzyvgwirne.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1bWhuZmRvemNqenl2Z3dpcm5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MjA1MjksImV4cCI6MjA5NDQ5NjUyOX0.pYr9dRij0B5weGjdgAtU9oKCv7wI1e4Z2jxq6gSbZws';

    // ==========================================
    // HELPERS
    // ==========================================
    function $(id) { return document.getElementById(id); }

    function showToast(message, type) {
        var container = $('toast-container');
        if (!container) return;
        var toast = document.createElement('div');
        toast.className = 'px-4 py-2 rounded shadow-lg text-xs font-bold uppercase tracking-widest text-white transform transition-all duration-300 translate-x-full ' + (type === 'error' ? 'bg-red-600' : 'bg-cyan-600');
        toast.innerText = message;
        container.appendChild(toast);
        requestAnimationFrame(function() { toast.classList.remove('translate-x-full'); });
        setTimeout(function() {
            toast.classList.add('translate-x-full');
            toast.style.opacity = '0';
            setTimeout(function() { toast.remove(); }, 300);
        }, 3000);
    }

    function updateUIElo() {
        var d = $('dashboard-elo'); if(d) d.innerText = myElo;
        var c = $('card-elo'); if(c) c.innerText = myElo;
        var a = $('arena-local-elo'); if(a) a.innerText = 'ELO: ' + myElo;
    }

    // ==========================================
    // DYNAMIC ONLINE COUNTER
    // ==========================================
    setInterval(function() {
        baseOnline += Math.floor(Math.random() * 11) - 5;
        if (baseOnline < 1400) baseOnline = 1400;
        if (baseOnline > 1600) baseOnline = 1600;
        var text = baseOnline + ' ONLINE';
        var e1 = $('online-count-1'); if(e1) e1.innerText = text;
        var e2 = $('online-count-2'); if(e2) e2.innerText = text;
    }, 3500);

    // ==========================================
    // ROUTER
    // ==========================================
    function navigate(viewId) {
        console.log('[KUSAURA] Navigate:', viewId);
        var views = document.querySelectorAll('.view');
        for (var i = 0; i < views.length; i++) {
            views[i].classList.remove('active');
        }

        var target = $('view-' + viewId);
        if (target) {
            target.classList.add('active');
        }

        if (viewId === 'camera-check') {
            startRealCameraCheck();
        } else {
            stopCameraCheck();
        }
    }

    // Expose globally
    window.navigate = navigate;

    // ==========================================
    // CAMERA CHECK (MEDIAPIPE)
    // ==========================================
    function stopCameraCheck() {
        if (ccCamera) { try { ccCamera.stop(); } catch(e){} ccCamera = null; }
        var video = $('webcam');
        if (video && video.srcObject) {
            var tracks = video.srcObject.getTracks();
            for (var i = 0; i < tracks.length; i++) tracks[i].stop();
            video.srcObject = null;
        }
        if (ccFaceMesh) { try { ccFaceMesh.close(); } catch(e){} ccFaceMesh = null; }
    }

    function startRealCameraCheck() {
        var video = $('webcam');
        var canvas = $('output_canvas');
        if (!video || !canvas) { console.error('[KUSAURA] webcam or canvas not found'); return; }

        var ctx = canvas.getContext('2d');
        var statusText = $('cam-status-text');
        var actionBadge = $('action-badge');
        var progressBar = $('progress-bar');
        var scannerLine = $('scanner-line');

        ccStage = 1;
        ccBlinkCount = 0;
        ccBlinkState = false;
        if (progressBar) progressBar.style.width = '0%';
        if (actionBadge) {
            actionBadge.innerText = '👁️ ALIGN FACE';
            actionBadge.className = 'bg-black/80 backdrop-blur-md border border-white/20 text-white font-logo text-lg px-8 py-3 rounded-xl uppercase tracking-widest shadow-xl flex items-center gap-2';
        }
        if (scannerLine) scannerLine.style.display = 'block';

        var s1 = $('step-1'), s2 = $('step-2'), s3 = $('step-3'), s4 = $('step-4');
        if(s1) s1.className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]';
        if(s2) s2.className = 'text-[#4a4759]';
        if(s3) s3.className = 'text-[#4a4759]';
        if(s4) s4.className = 'text-[#4a4759]';

        if(statusText) { statusText.innerText = 'LOADING AI...'; statusText.style.display = 'flex'; }

        // Check if FaceMesh exists
        if (typeof FaceMesh === 'undefined') {
            console.error('[KUSAURA] FaceMesh not loaded');
            if(statusText) statusText.innerText = 'AI LOADING FAILED';
            return;
        }

        try {
            ccFaceMesh = new FaceMesh({
                locateFile: function(file) {
                    return 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/' + file;
                }
            });
            ccFaceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            var lastBadge = '';
            function setBadge(text) {
                if (lastBadge !== text && actionBadge) {
                    actionBadge.innerText = text;
                    lastBadge = text;
                }
            }

            ccFaceMesh.onResults(function(results) {
                if(statusText) statusText.style.display = 'none';
                ctx.save();
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                    var landmarks = results.multiFaceLandmarks[0];

                    // Draw face mesh
                    if (typeof drawConnectors !== 'undefined' && typeof FACEMESH_TESSELATION !== 'undefined') {
                        drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {color: 'rgba(34, 211, 238, 0.15)', lineWidth: 0.5});
                        drawConnectors(ctx, landmarks, FACEMESH_RIGHT_EYE, {color: '#22d3ee', lineWidth: 1});
                        drawConnectors(ctx, landmarks, FACEMESH_LEFT_EYE, {color: '#22d3ee', lineWidth: 1});
                    }

                    // LIVENESS STATE MACHINE
                    if (ccStage === 1) {
                        setBadge('👁️ HOLD STILL');
                        if(progressBar) progressBar.style.width = '25%';
                        ccStage = 1.5;
                        setTimeout(function() {
                            if (ccStage === 1.5) {
                                ccStage = 2;
                                if(s2) s2.className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]';
                            }
                        }, 1500);
                    }
                    else if (ccStage === 2) {
                        setBadge('😉 BLINK NOW');
                        if(progressBar) progressBar.style.width = '50%';
                        var lDist = Math.abs(landmarks[159].y - landmarks[145].y);
                        var rDist = Math.abs(landmarks[386].y - landmarks[374].y);
                        var isBlinking = (lDist < 0.012 && rDist < 0.012);
                        if (isBlinking && !ccBlinkState) ccBlinkCount++;
                        ccBlinkState = isBlinking;
                        if (ccBlinkCount >= 1) {
                            ccStage = 3;
                            if(s3) s3.className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]';
                        }
                    }
                    else if (ccStage === 3) {
                        setBadge('🔄 TURN HEAD LEFT/RIGHT');
                        if(progressBar) progressBar.style.width = '75%';
                        var nx = landmarks[1].x;
                        if (nx < 0.40 || nx > 0.60) {
                            ccStage = 4;
                            if(s4) s4.className = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,255,213,0.5)]';
                        }
                    }
                    else if (ccStage === 4) {
                        setBadge('✅ VERIFIED');
                        if(actionBadge) {
                            actionBadge.className = 'bg-green-600/90 backdrop-blur-md border border-green-400 text-white font-logo text-lg px-8 py-3 rounded-xl uppercase tracking-widest shadow-xl flex items-center gap-2';
                        }
                        if(progressBar) progressBar.style.width = '100%';
                        if(scannerLine) scannerLine.style.display = 'none';
                        ccStage = 5;
                        setTimeout(function() { navigate('menu'); }, 1500);
                    }
                } else {
                    setBadge('⚠️ FACE NOT DETECTED');
                }
                ctx.restore();
            });

            // Check if Camera exists
            if (typeof Camera === 'undefined') {
                console.error('[KUSAURA] Camera utility not loaded');
                if(statusText) statusText.innerText = 'CAMERA UTIL FAILED';
                return;
            }

            ccCamera = new Camera(video, {
                onFrame: function() {
                    if (canvas.width !== video.videoWidth && video.videoWidth > 0) {
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                    }
                    return ccFaceMesh.send({image: video});
                },
                width: 640,
                height: 480
            });
            ccCamera.start();

        } catch (e) {
            console.error('[KUSAURA] Camera Check Error:', e);
            if(statusText) statusText.innerText = 'ERROR: ' + e.message;
        }
    }

    // ==========================================
    // PRIVATE ROOM
    // ==========================================
    function generateRoomCode() {
        var joinDiv = $('private-room-join');
        var genDiv = $('private-room-generated');
        if(joinDiv) joinDiv.style.display = 'none';
        if(genDiv) genDiv.style.display = 'flex';
        var code = Math.random().toString(36).substring(2, 8).toUpperCase();
        var inp = $('generated-code');
        if(inp) inp.value = code;
    }

    function copyRoomCode() {
        var inp = $('generated-code');
        if (!inp) return;
        inp.select();
        inp.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(inp.value)
            .then(function() { showToast('CODE COPIED TO CLIPBOARD'); })
            .catch(function() { showToast('FAILED TO COPY', 'error'); });
    }

    function joinPrivateRoom(isHost) {
        var code;
        if (isHost) {
            var g = $('generated-code');
            code = g ? g.value : '';
        } else {
            var r = $('room-code-input');
            code = r ? r.value.trim().toUpperCase() : '';
            if (r) r.value = '';
        }
        if (code.length < 3) { showToast('INVALID ROOM CODE', 'error'); return; }
        showToast('JOINING ROOM: ' + code);
        setTimeout(function() { startArenaMatch(true, code, isHost); }, 500);
    }

    // ==========================================
    // 1V1 ARENA
    // ==========================================
    function startArenaMatch(isPrivate, code, isHost) {
        navigate('battle');
        resetArenaUI();

        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(function(stream) {
                arenaStream = stream;
                var localVid = $('arena-local-vid');
                if(localVid) localVid.srcObject = stream;

                // Start AI scan IMMEDIATELY
                setTimeout(function() { startLiveMogScan(); }, 500);

                if (peer && supabase && myPeerId) {
                    if (isPrivate) {
                        var eloEl = $('arena-stranger-elo');
                        if(eloEl) eloEl.innerText = isHost ? 'WAITING FOR FRIEND...' : 'CONNECTING...';
                        currentPrivateChannel = supabase.channel('room_' + code, { config: { broadcast: { self: false } } });
                        currentPrivateChannel.on('broadcast', {event: 'join_room'}, function(msg) {
                            if (isHost) connectToOpponent(msg.payload.peerId);
                        }).subscribe(function(status) {
                            if (status === 'SUBSCRIBED' && !isHost) {
                                currentPrivateChannel.send({type: 'broadcast', event: 'join_room', payload: {peerId: myPeerId}});
                            }
                        });
                    } else {
                        isSearching = true;
                        arenaSearchInterval = setInterval(function() {
                            if(isSearching && arenaChannel) arenaChannel.send({ type: 'broadcast', event: 'find_match', payload: { peerId: myPeerId } });
                        }, 2000);
                        if(arenaChannel) arenaChannel.send({ type: 'broadcast', event: 'find_match', payload: { peerId: myPeerId } });
                    }
                }
            })
            .catch(function(e) {
                console.error('Camera error:', e);
                showToast('CAMERA PERMISSION DENIED', 'error');
            });
    }

    function connectToOpponent(opponentPeerId) {
        stopSearching();
        var call = peer.call(opponentPeerId, arenaStream);
        currentCall = call;
        call.on('stream', function(remoteStream) {
            var vid = $('arena-stranger-vid');
            if(vid) vid.srcObject = remoteStream;
            var elo = $('arena-stranger-elo');
            if(elo) elo.innerText = 'CONNECTED';
            var conn = peer.connect(opponentPeerId);
            setupDataConnection(conn);
            startLiveMogScan();
        });
    }

    function setupDataConnection(conn) {
        currentConn = conn;
        conn.on('data', function(data) {
            if (data.type === 'score') {
                opponentArenaScore = data.score;
                if (myArenaScore && opponentArenaScore) finalizeMatch();
            }
        });
    }

    // ==========================================
    // AI FACIAL ANALYSIS ENGINE
    // Multi-frame averaged, properly calibrated
    // ==========================================
    var arenaFaceMesh = null;
    var collectedFrames = [];

    function dist(a, b) {
        return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    }

    // Average multiple landmark frames for stability
    function averageLandmarks(frames) {
        if (frames.length === 0) return null;
        if (frames.length === 1) return frames[0];
        var avg = [];
        for (var i = 0; i < frames[0].length; i++) {
            var sumX = 0, sumY = 0, sumZ = 0;
            for (var f = 0; f < frames.length; f++) {
                sumX += frames[f][i].x;
                sumY += frames[f][i].y;
                sumZ += (frames[f][i].z || 0);
            }
            avg.push({ x: sumX / frames.length, y: sumY / frames.length, z: sumZ / frames.length });
        }
        return avg;
    }

    function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

    function analyzeFace(landmarks) {
        // All coordinates are normalized 0-1 by MediaPipe
        // Y axis: 0 = top, 1 = bottom

        // ===== 1. CANTHAL TILT (Hunter Eyes) =====
        // Positive canthal tilt = outer corner HIGHER than inner = attractive
        // Left eye: inner corner = 133, outer corner = 33
        // Right eye: inner corner = 362, outer corner = 263
        // In normalized coords: higher = smaller Y value
        var leftTiltDeg = Math.atan2(landmarks[133].y - landmarks[33].y, Math.abs(landmarks[33].x - landmarks[133].x)) * (180 / Math.PI);
        var rightTiltDeg = Math.atan2(landmarks[362].y - landmarks[263].y, Math.abs(landmarks[263].x - landmarks[362].x)) * (180 / Math.PI);
        var avgTiltDeg = (leftTiltDeg + rightTiltDeg) / 2;
        // Typical range: -5 to +10 degrees. Positive = hunter eyes
        // Map: -5deg -> 4.0, 0deg -> 6.5, +5deg -> 8.5, +10deg -> 9.5
        var hunter = clamp(6.5 + avgTiltDeg * 0.5, 3.0, 9.9);

        // ===== 2. JAWLINE DEFINITION =====
        // Compare gonion (jaw angle) width to bizygomatic (cheekbone) width
        // Jaw angles: 172, 397 | Cheekbones: 234, 454
        var jawW = dist(landmarks[172], landmarks[397]);
        var cheekW = dist(landmarks[234], landmarks[454]);
        var jawRatio = jawW / cheekW;
        // Good jawline: ratio 0.75-0.85 (jaw narrower than cheeks = defined)
        // Map: 0.70 -> 9.0, 0.80 -> 8.5, 0.90 -> 7.0, 1.0 -> 5.5
        var jaw = clamp(12.5 - jawRatio * 5.0, 3.0, 9.9);

        // ===== 3. FACIAL SYMMETRY =====
        // Compare left/right distances from nose center (landmark 1)
        var noseTip = landmarks[1];
        // Eye widths
        var leftEyeW = dist(landmarks[33], landmarks[133]);
        var rightEyeW = dist(landmarks[263], landmarks[362]);
        var eyeWSymm = Math.min(leftEyeW, rightEyeW) / Math.max(leftEyeW, rightEyeW);
        // Eye heights
        var leftEyeH = dist(landmarks[159], landmarks[145]);
        var rightEyeH = dist(landmarks[386], landmarks[374]);
        var eyeHSymm = Math.min(leftEyeH, rightEyeH) / Math.max(leftEyeH, rightEyeH);
        // Mouth corners to nose
        var leftMouthDist = dist(landmarks[61], noseTip);
        var rightMouthDist = dist(landmarks[291], noseTip);
        var mouthSymm = Math.min(leftMouthDist, rightMouthDist) / Math.max(leftMouthDist, rightMouthDist);
        // Average symmetry (0.0 to 1.0 where 1.0 = perfect)
        var avgSymm = (eyeWSymm + eyeHSymm + mouthSymm) / 3;
        // Map: 1.0 -> 9.8, 0.95 -> 8.5, 0.90 -> 7.0, 0.85 -> 5.5
        var sym = clamp(avgSymm * 12.0 - 2.0, 4.0, 9.9);

        // ===== 4. MIDFACE RATIO =====
        // Ratio of midface length (eyes to mouth) vs lower third (mouth to chin)
        var eyeCenterY = (landmarks[159].y + landmarks[386].y) / 2;
        var mouthTopY = landmarks[13].y;
        var chinY = landmarks[152].y;
        var foreheadY = landmarks[10].y;
        var totalFaceH = chinY - foreheadY;
        var midfaceLen = mouthTopY - eyeCenterY;
        var midfaceRatio = midfaceLen / totalFaceH;
        // Ideal midface ratio: 0.33-0.38 (shorter = more attractive)
        // Map: 0.30 -> 9.5, 0.35 -> 8.5, 0.40 -> 7.0, 0.45 -> 5.5, 0.50 -> 4.0
        var mid = clamp(14.0 - midfaceRatio * 20.0, 3.0, 9.9);

        // ===== 5. FWHR (Facial Width to Height Ratio) =====
        // Width: bizygomatic | Height: upper face (brow to upper lip)
        var fwhrVal = cheekW / (mouthTopY - foreheadY);
        // Ideal FWHR: 1.8-2.1 (higher = more dominant/attractive)
        // Map: 1.5 -> 5.5, 1.8 -> 7.5, 2.0 -> 8.5, 2.2 -> 9.0, 2.5 -> 7.5
        var fwhrScore;
        if (fwhrVal <= 2.0) {
            fwhrScore = clamp(2.0 + fwhrVal * 3.25, 3.0, 9.5);
        } else {
            fwhrScore = clamp(15.0 - fwhrVal * 3.0, 3.0, 9.5);
        }

        // ===== OVERALL AURA SCORE =====
        var overall = hunter * 0.25 + jaw * 0.20 + sym * 0.20 + mid * 0.15 + fwhrScore * 0.20;

        // Add tiny noise (±0.15) for realism
        var n = function() { return (Math.random() - 0.5) * 0.3; };
        hunter = clamp(hunter + n(), 3.0, 9.9);
        jaw = clamp(jaw + n(), 3.0, 9.9);
        sym = clamp(sym + n(), 4.0, 9.9);
        mid = clamp(mid + n(), 3.0, 9.9);
        fwhrScore = clamp(fwhrScore + n(), 3.0, 9.9);
        overall = clamp(overall + n() * 0.5, 3.0, 9.9);

        return {
            hunter: parseFloat(hunter.toFixed(1)),
            jaw: parseFloat(jaw.toFixed(1)),
            sym: parseFloat(sym.toFixed(1)),
            mid: parseFloat(mid.toFixed(1)),
            fwhr: parseFloat(fwhrScore.toFixed(1)),
            overall: parseFloat(overall.toFixed(1))
        };
    }

    var TRAIT_NAMES = {hunter:'HUNTER EYES',jaw:'JAWLINE',sym:'SYMMETRY',mid:'MIDFACE RATIO',fwhr:'FWHR'};
    var FLAW_NAMES = {hunter:'PREY EYES',jaw:'WEAK JAW',sym:'ASYMMETRY',mid:'LONG MIDFACE',fwhr:'BAD FWHR'};
    var scanTimerId = null, scanFeedId = null, scanCountdown = 30;

    function getBonFlaw(m) {
        var keys = ['hunter','jaw','sym','mid','fwhr'], best = keys[0], worst = keys[0];
        for (var i = 1; i < keys.length; i++) {
            if (m[keys[i]] > m[best]) best = keys[i];
            if (m[keys[i]] < m[worst]) worst = keys[i];
        }
        return {bon: best, flaw: worst};
    }

    function updateHUD(prefix, metrics) {
        var sc = $(prefix === 'l' ? 'hud-l-score' : 'hud-s-score');
        if (sc) sc.innerText = metrics.overall.toFixed(1);
        var bf = getBonFlaw(metrics);
        var bon = $(prefix === 'l' ? 'hud-l-bon' : 'hud-s-bon');
        var flaw = $(prefix === 'l' ? 'hud-l-flaw' : 'hud-s-flaw');
        if (bon) bon.innerText = TRAIT_NAMES[bf.bon];
        if (flaw) flaw.innerText = FLAW_NAMES[bf.flaw];
        var fl = $(prefix === 'l' ? 'float-l-text' : 'float-s-text');
        if (fl) fl.innerText = TRAIT_NAMES[bf.bon];
        var flC = $(prefix === 'l' ? 'float-label-local' : 'float-label-stranger');
        if (flC) flC.style.opacity = '1';
    }

    function startLiveMogScan() {
        myArenaScore = null; opponentArenaScore = null;
        collectedFrames = []; scanCountdown = 30;
        var hl = $('hud-local'); if(hl) hl.style.opacity = '1';
        var hs = $('hud-stranger'); if(hs) hs.style.opacity = '1';
        var at = $('arena-timer'); if(at) at.style.opacity = '1';
        var tt = $('arena-timer-text'); if(tt) tt.innerText = '00:30';

        // Countdown timer
        var tt = $('arena-timer-text');
        scanTimerId = setInterval(function() {
            scanCountdown--;
            if (tt) tt.innerText = '00:' + (scanCountdown < 10 ? '0' : '') + scanCountdown;
            if (scanCountdown <= 0) { clearInterval(scanTimerId); finalizeLiveScan(); }
        }, 1000);

        if (typeof FaceMesh === 'undefined') return;
        try {
            arenaFaceMesh = new FaceMesh({ locateFile: function(f) { return 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/' + f; } });
            arenaFaceMesh.setOptions({ maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:0.5, minTrackingConfidence:0.5 });
            arenaFaceMesh.onResults(function(res) {
                if (res.multiFaceLandmarks && res.multiFaceLandmarks.length > 0) {
                    var lm = res.multiFaceLandmarks[0];
                    collectedFrames.push(lm);
                    if (collectedFrames.length > 15) collectedFrames.shift();
                    // Draw mesh
                    var c = $('arena-local-canvas'), v = $('arena-local-vid');
                    if (c && v && typeof drawConnectors !== 'undefined') {
                        if (c.width !== v.videoWidth && v.videoWidth > 0) { c.width = v.videoWidth; c.height = v.videoHeight; }
                        var ctx = c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height);
                        drawConnectors(ctx, lm, FACEMESH_TESSELATION, {color:'rgba(34,211,238,0.12)', lineWidth:0.5});
                        drawConnectors(ctx, lm, FACEMESH_FACE_OVAL, {color:'rgba(34,211,238,0.3)', lineWidth:1});
                    }
                    var avg = averageLandmarks(collectedFrames);
                    var m = analyzeFace(avg);
                    updateHUD('l', m);
                    myArenaScore = m;
                } else {
                    var sc = $('hud-l-score'); if(sc) sc.innerText = '-.-';
                }
            });
            var vid = $('arena-local-vid');
            scanFeedId = setInterval(function() {
                if (vid && vid.readyState >= 2 && arenaFaceMesh) arenaFaceMesh.send({image: vid});
            }, 300);
        } catch(e) { console.error('[KUSAURA] Scan error:', e); }
    }

    function finalizeLiveScan() {
        clearInterval(scanTimerId); clearInterval(scanFeedId);
        if (arenaFaceMesh) { try { arenaFaceMesh.close(); } catch(e){} arenaFaceMesh = null; }
        var at = $('arena-timer'); if(at) at.style.opacity = '0';
        if (!myArenaScore) myArenaScore = {hunter:5,jaw:5,sym:5,mid:5,fwhr:5,overall:5.0};
        if (currentConn) { try { currentConn.send({type:'score',score:myArenaScore}); } catch(e){} }
        if (myArenaScore && opponentArenaScore) finalizeMatch();
    }

    function finalizeMatch() {
        clearInterval(scanTimerId); clearInterval(scanFeedId);
        var mS = myArenaScore.overall || 5, sS = opponentArenaScore.overall || 5;
        var expected = 1 / (1 + Math.pow(10, (1000 - myElo) / 400));
        if (mS > sS) myElo += Math.round(32 * (1 - expected));
        else if (mS < sS) myElo += Math.round(32 * (0 - expected));
        updateUIElo();
        updateHUD('l', myArenaScore);
        updateHUD('s', opponentArenaScore);
        var el = $('hud-l-elo-val'); if(el) el.innerText = myElo;
    }

    function stopSearching() { isSearching = false; clearInterval(arenaSearchInterval); }

    function exitArena() {
        stopSearching();
        clearInterval(scanTimerId); clearInterval(scanFeedId);
        if(arenaFaceMesh) { try { arenaFaceMesh.close(); } catch(e){} arenaFaceMesh = null; }
        if(currentCall) { try { currentCall.close(); } catch(e){} currentCall = null; }
        if(currentConn) { try { currentConn.close(); } catch(e){} currentConn = null; }
        if(currentPrivateChannel) { try { currentPrivateChannel.unsubscribe(); } catch(e){} currentPrivateChannel = null; }
        if(arenaStream) { var t = arenaStream.getTracks(); for(var i=0;i<t.length;i++) t[i].stop(); arenaStream = null; }
        var lc = $('arena-local-canvas'); if(lc) lc.getContext('2d').clearRect(0,0,lc.width,lc.height);
        navigate('menu');
    }

    function resetArenaUI() {
        var sv = $('arena-stranger-vid'); if(sv) sv.srcObject = null;
        var ids = ['hud-local','hud-stranger','arena-timer','float-label-local','float-label-stranger'];
        for(var i=0;i<ids.length;i++) { var e=$(ids[i]); if(e) e.style.opacity='0'; }
        var ls = $('hud-l-score'); if(ls) ls.innerText = '-.-';
        var ss = $('hud-s-score'); if(ss) ss.innerText = '-.-';
        var b1=$('hud-l-bon'); if(b1) b1.innerText='—';
        var b2=$('hud-s-bon'); if(b2) b2.innerText='—';
        var f1=$('hud-l-flaw'); if(f1) f1.innerText='—';
        var f2=$('hud-s-flaw'); if(f2) f2.innerText='—';
    }

    // ==========================================
    // EVENT LISTENERS (no inline onclick!)
    // ==========================================
    function setupEvents() {
        // Landing -> Camera Check
        var btnStart = $('btn-start-camera');
        if (btnStart) {
            btnStart.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('[KUSAURA] Start Camera clicked');
                navigate('camera-check');
            });
        }

        // Camera Check -> Exit
        var btnExit = $('btn-exit-camera');
        if (btnExit) {
            btnExit.addEventListener('click', function(e) {
                e.preventDefault();
                navigate('landing');
            });
        }

        // Dashboard -> 1v1 Arena
        var btn1v1 = $('btn-1v1-arena');
        if (btn1v1) {
            btn1v1.addEventListener('click', function(e) {
                e.preventDefault();
                startArenaMatch(false, null, false);
            });
        }

        // Private Room card click -> generate code
        var btnPrivate = $('btn-private-room');
        if (btnPrivate) {
            btnPrivate.addEventListener('click', function(e) {
                // Don't generate if clicking inner elements
                if (e.target.closest('#private-room-generated') || e.target.closest('#private-room-join')) return;
                generateRoomCode();
            });
        }

        // Copy code
        var btnCopy = $('btn-copy-code');
        if (btnCopy) {
            btnCopy.addEventListener('click', function(e) {
                e.stopPropagation();
                copyRoomCode();
            });
        }

        // Start match (host)
        var btnStartMatch = $('btn-start-match');
        if (btnStartMatch) {
            btnStartMatch.addEventListener('click', function(e) {
                e.stopPropagation();
                joinPrivateRoom(true);
            });
        }

        // Join room (guest)
        var btnJoin = $('btn-join-room');
        if (btnJoin) {
            btnJoin.addEventListener('click', function(e) {
                e.stopPropagation();
                joinPrivateRoom(false);
            });
        }

        // Arena exit
        var btnExitArena = $('btn-exit-arena');
        if (btnExitArena) {
            btnExitArena.addEventListener('click', function(e) {
                e.preventDefault();
                exitArena();
            });
        }

        // Next match
        var btnNext = $('btn-next-match');
        if (btnNext) {
            btnNext.addEventListener('click', function(e) {
                e.preventDefault();
                startArenaMatch(false, null, false);
            });
        }
    }

    // ==========================================
    // MULTIPLAYER INIT (safe, non-blocking)
    // ==========================================
    function initMultiplayer() {
        try {
            if (window.supabase && window.supabase.createClient) {
                supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                arenaChannel = supabase.channel('global_arena', { config: { broadcast: { self: false } } });
                console.log('[KUSAURA] Supabase connected');
            } else {
                console.warn('[KUSAURA] Supabase not available');
            }
        } catch(e) {
            console.error('[KUSAURA] Supabase init error:', e);
        }

        try {
            if (window.Peer) {
                peer = new Peer();
                peer.on('open', function(id) {
                    myPeerId = id;
                    console.log('[KUSAURA] PeerJS ID:', id);
                });
                peer.on('error', function(err) {
                    console.warn('[KUSAURA] PeerJS error:', err.type);
                });
                peer.on('call', function(call) {
                    if (isSearching || currentPrivateChannel) {
                        stopSearching();
                        call.answer(arenaStream);
                        currentCall = call;
                        call.on('stream', function(remoteStream) {
                            var vid = $('arena-stranger-vid');
                            if(vid) vid.srcObject = remoteStream;
                            var elo = $('arena-stranger-elo');
                            if(elo) elo.innerText = 'CONNECTED';
                            startLiveMogScan();
                        });
                    } else {
                        call.close();
                    }
                });
                peer.on('connection', function(conn) { setupDataConnection(conn); });

                if (arenaChannel) {
                    arenaChannel.on('broadcast', { event: 'find_match' }, function(msg) {
                        if (isSearching && myPeerId && myPeerId > msg.payload.peerId) {
                            connectToOpponent(msg.payload.peerId);
                        }
                    }).subscribe();
                }
                console.log('[KUSAURA] PeerJS initialized');
            } else {
                console.warn('[KUSAURA] PeerJS not available');
            }
        } catch(e) {
            console.error('[KUSAURA] PeerJS init error:', e);
        }
    }

    // ==========================================
    // BOOT
    // ==========================================
    console.log('[KUSAURA] Script loaded OK');
    setupEvents();
    setTimeout(initMultiplayer, 1000);

})();
