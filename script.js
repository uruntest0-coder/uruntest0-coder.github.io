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
        if (!peer || !supabase) { showToast('MULTIPLAYER LOADING...', 'error'); return; }
        if (!myPeerId) { showToast('CONNECTING TO SERVER...', 'error'); return; }

        navigate('battle');
        resetArenaUI();

        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(function(stream) {
                arenaStream = stream;
                var localVid = $('arena-local-vid');
                if(localVid) localVid.srcObject = stream;

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
                    var eloEl2 = $('arena-stranger-elo');
                    if(eloEl2) eloEl2.innerText = 'SEARCHING REAL PLAYERS...';
                    arenaSearchInterval = setInterval(function() {
                        if(isSearching && arenaChannel) {
                            arenaChannel.send({ type: 'broadcast', event: 'find_match', payload: { peerId: myPeerId } });
                        }
                    }, 2000);
                    if(arenaChannel) arenaChannel.send({ type: 'broadcast', event: 'find_match', payload: { peerId: myPeerId } });
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
    // Uses real MediaPipe landmarks to calculate:
    // - Canthal Tilt (Hunter Eyes)
    // - Jawline Definition
    // - Facial Symmetry
    // - Midface Ratio
    // - FWHR (Face Width-to-Height Ratio)
    // ==========================================
    var arenaFaceMesh = null;
    var localLandmarks = null;

    function dist(a, b) {
        return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    }

    function analyzeFace(landmarks) {
        // 1. CANTHAL TILT (Hunter Eyes) - angle of eye from inner to outer corner
        // Positive tilt = hunter eyes (upward slant) = good
        // Left eye: inner=133, outer=33 | Right eye: inner=362, outer=263
        var leftTilt = Math.atan2(landmarks[33].y - landmarks[133].y, landmarks[33].x - landmarks[133].x) * (180 / Math.PI);
        var rightTilt = Math.atan2(landmarks[263].y - landmarks[362].y, landmarks[263].x - landmarks[362].x) * (180 / Math.PI);
        var avgTilt = (Math.abs(leftTilt) + Math.abs(rightTilt)) / 2;
        // Ideal: slight negative (upward). Map -8 to +8 degrees into 1-10
        var hunterRaw = 10 - (avgTilt + 5) * 0.5;
        var hunter = Math.max(3, Math.min(9.8, hunterRaw + (Math.random() * 1.0 - 0.5)));

        // 2. JAWLINE DEFINITION - ratio of jaw width to mid-face width
        // Jaw: 172 (left), 397 (right) | Cheekbones: 234, 454
        var jawWidth = dist(landmarks[172], landmarks[397]);
        var cheekWidth = dist(landmarks[234], landmarks[454]);
        var jawRatio = jawWidth / cheekWidth;
        // Ideal jawRatio around 0.85-0.95 (defined jaw, not too wide)
        var jawRaw = 10 - Math.abs(jawRatio - 0.90) * 20;
        var jaw = Math.max(3, Math.min(9.8, jawRaw + (Math.random() * 0.8 - 0.4)));

        // 3. SYMMETRY - compare left vs right eye height, mouth corners
        var leftEyeH = dist(landmarks[159], landmarks[145]);
        var rightEyeH = dist(landmarks[386], landmarks[374]);
        var eyeSymmetry = 1 - Math.abs(leftEyeH - rightEyeH) / Math.max(leftEyeH, rightEyeH);
        
        var leftMouth = dist(landmarks[61], landmarks[1]); // left mouth to nose
        var rightMouth = dist(landmarks[291], landmarks[1]); // right mouth to nose
        var mouthSymmetry = 1 - Math.abs(leftMouth - rightMouth) / Math.max(leftMouth, rightMouth);
        
        var symRaw = ((eyeSymmetry + mouthSymmetry) / 2) * 10;
        var sym = Math.max(4, Math.min(9.9, symRaw + (Math.random() * 0.6 - 0.3)));

        // 4. MIDFACE RATIO - distance from eyes to mouth vs face height
        // Eyes center: avg of 159,145 (left) and 386,374 (right)
        // Forehead: 10, Chin: 152
        var eyeCenterY = (landmarks[159].y + landmarks[386].y) / 2;
        var mouthY = landmarks[13].y;
        var foreheadY = landmarks[10].y;
        var chinY = landmarks[152].y;
        var midfaceDist = mouthY - eyeCenterY;
        var faceHeight = chinY - foreheadY;
        var midfaceRatio = midfaceDist / faceHeight;
        // Ideal midface ratio: ~0.35-0.40 (short midface = attractive)
        var midRaw = 10 - Math.abs(midfaceRatio - 0.37) * 40;
        var mid = Math.max(3, Math.min(9.8, midRaw + (Math.random() * 0.8 - 0.4)));

        // 5. FWHR (Facial Width-to-Height Ratio)
        // Width: cheekbone width | Height: brow to upper lip
        var fwhrWidth = cheekWidth;
        var fwhrHeight = landmarks[13].y - landmarks[10].y;
        var fwhr = fwhrWidth / fwhrHeight;
        // Ideal FWHR: ~1.8-2.0 (masculine/attractive)
        var fwhrRaw = 10 - Math.abs(fwhr - 1.9) * 8;
        var fwhrScore = Math.max(3, Math.min(9.8, fwhrRaw + (Math.random() * 0.6 - 0.3)));

        // OVERALL SCORE - weighted average
        var overall = (hunter * 0.25 + jaw * 0.20 + sym * 0.20 + mid * 0.15 + fwhrScore * 0.20);
        overall = Math.max(3, Math.min(9.9, overall));

        return {
            hunter: parseFloat(hunter.toFixed(1)),
            jaw: parseFloat(jaw.toFixed(1)),
            sym: parseFloat(sym.toFixed(1)),
            mid: parseFloat(mid.toFixed(1)),
            fwhr: parseFloat(fwhrScore.toFixed(1)),
            overall: parseFloat(overall.toFixed(1))
        };
    }

    function renderMetrics(prefix, metrics, delay) {
        var cats = ['hunter', 'jaw', 'sym', 'mid', 'fwhr'];
        var d = delay || 0;
        for (var i = 0; i < cats.length; i++) {
            (function(cat, idx) {
                setTimeout(function() {
                    var el = $(prefix + '-' + cat);
                    var bar = $(prefix + '-' + cat + '-bar');
                    if (el) el.innerText = metrics[cat].toFixed(1);
                    if (bar) bar.style.width = (metrics[cat] * 10) + '%';
                }, d + idx * 200);
            })(cats[i], i);
        }
    }

    function startLiveMogScan() {
        myArenaScore = null;
        opponentArenaScore = null;
        localLandmarks = null;
        var btn = $('btn-next-match');
        if(btn) btn.style.display = 'none';
        var banner = $('scan-banner');
        if(banner) banner.style.display = 'flex';

        // Start FaceMesh on local video for real analysis
        if (typeof FaceMesh !== 'undefined') {
            try {
                arenaFaceMesh = new FaceMesh({
                    locateFile: function(file) {
                        return 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/' + file;
                    }
                });
                arenaFaceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

                var frameCount = 0;
                var bestLandmarks = null;

                arenaFaceMesh.onResults(function(results) {
                    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                        bestLandmarks = results.multiFaceLandmarks[0];
                        frameCount++;

                        // Draw mesh on local canvas
                        var c = $('arena-local-canvas');
                        var v = $('arena-local-vid');
                        if (c && v && typeof drawConnectors !== 'undefined') {
                            if (c.width !== v.videoWidth && v.videoWidth > 0) { c.width = v.videoWidth; c.height = v.videoHeight; }
                            var ctx = c.getContext('2d');
                            ctx.clearRect(0, 0, c.width, c.height);
                            drawConnectors(ctx, bestLandmarks, FACEMESH_TESSELATION, {color: 'rgba(34, 211, 238, 0.12)', lineWidth: 0.5});
                            drawConnectors(ctx, bestLandmarks, FACEMESH_RIGHT_EYE, {color: '#22d3ee', lineWidth: 1});
                            drawConnectors(ctx, bestLandmarks, FACEMESH_LEFT_EYE, {color: '#22d3ee', lineWidth: 1});
                            drawConnectors(ctx, bestLandmarks, FACEMESH_FACE_OVAL, {color: 'rgba(34,211,238,0.3)', lineWidth: 1});
                        }
                    }
                });

                // Capture a few frames then analyze
                var vid = $('arena-local-vid');
                if (vid && vid.srcObject) {
                    var scanInterval = setInterval(function() {
                        if (vid.readyState >= 2) {
                            arenaFaceMesh.send({image: vid});
                        }
                    }, 200);

                    // After 3 seconds, stop scanning and produce result
                    setTimeout(function() {
                        clearInterval(scanInterval);
                        if (banner) banner.style.display = 'none';

                        if (bestLandmarks) {
                            var metrics = analyzeFace(bestLandmarks);
                            myArenaScore = metrics;
                            if (currentConn) {
                                try { currentConn.send({ type: 'score', score: metrics }); } catch(e) {}
                            }
                            if (myArenaScore && opponentArenaScore) finalizeMatch();
                        } else {
                            // Fallback if no face detected
                            myArenaScore = { hunter: 5 + Math.random()*2, jaw: 5+Math.random()*2, sym: 6+Math.random()*2, mid: 5+Math.random()*2, fwhr: 5+Math.random()*2, overall: 5.5+Math.random()*2 };
                            if (currentConn) { try { currentConn.send({ type: 'score', score: myArenaScore }); } catch(e) {} }
                            if (myArenaScore && opponentArenaScore) finalizeMatch();
                        }

                        try { arenaFaceMesh.close(); } catch(e) {}
                        arenaFaceMesh = null;
                    }, 3500);
                }
            } catch(e) {
                console.error('[KUSAURA] Arena FaceMesh error:', e);
                if (banner) banner.style.display = 'none';
                // Fallback
                myArenaScore = { hunter: 5+Math.random()*3, jaw: 5+Math.random()*3, sym: 6+Math.random()*2, mid: 5+Math.random()*3, fwhr: 5+Math.random()*3, overall: 5.5+Math.random()*2.5 };
                if (currentConn) { try { currentConn.send({ type: 'score', score: myArenaScore }); } catch(e2) {} }
                if (myArenaScore && opponentArenaScore) finalizeMatch();
            }
        } else {
            // No FaceMesh available - fallback
            if (banner) banner.style.display = 'none';
            setTimeout(function() {
                myArenaScore = { hunter: 5+Math.random()*3, jaw: 5+Math.random()*3, sym: 6+Math.random()*2, mid: 5+Math.random()*3, fwhr: 5+Math.random()*3, overall: 5.5+Math.random()*2.5 };
                if (currentConn) { try { currentConn.send({ type: 'score', score: myArenaScore }); } catch(e) {} }
                if (myArenaScore && opponentArenaScore) finalizeMatch();
            }, 3000);
        }
    }

    function finalizeMatch() {
        var myM = myArenaScore;
        var opM = opponentArenaScore;
        var mScore = myM.overall || parseFloat(myM);
        var sScore = opM.overall || parseFloat(opM);
        var iWon = mScore > sScore;

        // Set scores
        var sScoreEl = $('stranger-score'); if(sScoreEl) sScoreEl.innerText = (typeof sScore === 'number' ? sScore.toFixed(1) : sScore);
        var mScoreEl = $('local-score'); if(mScoreEl) mScoreEl.innerText = (typeof mScore === 'number' ? mScore.toFixed(1) : mScore);

        var expected = 1 / (1 + Math.pow(10, (1000 - myElo) / 400));
        var sStatus = $('stranger-status'), mStatus = $('local-status');

        if (iWon) {
            if(sStatus) { sStatus.innerText = 'MOGGED'; sStatus.className = 'font-bold text-2xl tracking-[0.2em] uppercase mt-1 mb-4 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]'; }
            if(mStatus) { mStatus.innerText = 'MOGGER'; mStatus.className = 'font-bold text-2xl tracking-[0.2em] uppercase mt-1 mb-4 text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.8)]'; }
            myElo += Math.round(32 * (1 - expected));
        } else if (mScore < sScore) {
            if(sStatus) { sStatus.innerText = 'MOGGER'; sStatus.className = 'font-bold text-2xl tracking-[0.2em] uppercase mt-1 mb-4 text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.8)]'; }
            if(mStatus) { mStatus.innerText = 'MOGGED'; mStatus.className = 'font-bold text-2xl tracking-[0.2em] uppercase mt-1 mb-4 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]'; }
            myElo += Math.round(32 * (0 - expected));
        } else {
            if(sStatus) { sStatus.innerText = 'DRAW'; sStatus.className = 'font-bold text-2xl tracking-[0.2em] uppercase mt-1 mb-4 text-yellow-400'; }
            if(mStatus) { mStatus.innerText = 'DRAW'; mStatus.className = 'font-bold text-2xl tracking-[0.2em] uppercase mt-1 mb-4 text-yellow-400'; }
        }

        updateUIElo();

        // Show overlays
        var so = $('stranger-score-overlay'); if(so) { so.style.opacity = '1'; so.style.transform = 'scale(1)'; }
        var lo = $('local-score-overlay'); if(lo) { lo.style.opacity = '1'; lo.style.transform = 'scale(1)'; }

        // Animate metric bars with stagger
        if (myM.hunter !== undefined) renderMetrics('l', myM, 300);
        if (opM.hunter !== undefined) renderMetrics('s', opM, 300);

        var btn = $('btn-next-match'); if(btn) { btn.innerText = '⏭️ NEXT MATCH'; btn.style.display = 'flex'; }
    }

    function stopSearching() { isSearching = false; clearInterval(arenaSearchInterval); }

    function exitArena() {
        stopSearching();
        if(arenaFaceMesh) { try { arenaFaceMesh.close(); } catch(e){} arenaFaceMesh = null; }
        if(currentCall) { try { currentCall.close(); } catch(e){} currentCall = null; }
        if(currentConn) { try { currentConn.close(); } catch(e){} currentConn = null; }
        if(currentPrivateChannel) { try { currentPrivateChannel.unsubscribe(); } catch(e){} currentPrivateChannel = null; }
        if(arenaStream) { var t = arenaStream.getTracks(); for(var i=0;i<t.length;i++) t[i].stop(); arenaStream = null; }
        var banner = $('scan-banner'); if(banner) banner.style.display = 'none';
        // Clear canvases
        var lc = $('arena-local-canvas'); if(lc) { var ctx = lc.getContext('2d'); ctx.clearRect(0,0,lc.width,lc.height); }
        var sc = $('arena-stranger-canvas'); if(sc) { var ctx2 = sc.getContext('2d'); ctx2.clearRect(0,0,sc.width,sc.height); }
        navigate('menu');
    }

    function resetArenaUI() {
        var so = $('stranger-score-overlay'); if(so) { so.style.opacity = '0'; so.style.transform = 'scale(0.9)'; }
        var lo = $('local-score-overlay'); if(lo) { lo.style.opacity = '0'; lo.style.transform = 'scale(0.9)'; }
        var sv = $('arena-stranger-vid'); if(sv) sv.srcObject = null;
        var btn = $('btn-next-match'); if(btn) { btn.innerText = '❌ CANCEL SEARCH'; btn.style.display = 'flex'; }
        // Reset metric bars
        var cats = ['hunter', 'jaw', 'sym', 'mid', 'fwhr'];
        var prefixes = ['l', 's'];
        for (var p = 0; p < prefixes.length; p++) {
            for (var c = 0; c < cats.length; c++) {
                var el = $(prefixes[p] + '-' + cats[c]); if(el) el.innerText = '-';
                var bar = $(prefixes[p] + '-' + cats[c] + '-bar'); if(bar) bar.style.width = '0%';
            }
        }
        var banner = $('scan-banner'); if(banner) banner.style.display = 'none';
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
