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

    function startLiveMogScan() {
        myArenaScore = null;
        opponentArenaScore = null;
        var btn = $('btn-next-match');
        if(btn) btn.style.display = 'none';

        setTimeout(function() {
            var base = (myElo / 200) + 2.0;
            myArenaScore = (base + (Math.random() * 1.5 - 0.5)).toFixed(1);
            if (parseFloat(myArenaScore) > 10.0) myArenaScore = '9.9';
            if (currentConn) { try { currentConn.send({ type: 'score', score: myArenaScore }); } catch(e){} }
            if (myArenaScore && opponentArenaScore) finalizeMatch();
        }, 3000);
    }

    function finalizeMatch() {
        var sScore = parseFloat(opponentArenaScore);
        var mScore = parseFloat(myArenaScore);
        var iWon = mScore > sScore;

        var sScoreEl = $('stranger-score'); if(sScoreEl) sScoreEl.innerText = sScore.toFixed(1);
        var mScoreEl = $('local-score'); if(mScoreEl) mScoreEl.innerText = mScore.toFixed(1);

        var expected = 1 / (1 + Math.pow(10, (1000 - myElo) / 400));
        var sStatus = $('stranger-status'), mStatus = $('local-status');

        if (iWon) {
            if(sStatus) { sStatus.innerText = 'MOGGED'; sStatus.className = 'font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]'; }
            if(mStatus) { mStatus.innerText = 'WINNER'; mStatus.className = 'font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.8)]'; }
            myElo += Math.round(32 * (1 - expected));
        } else if (mScore < sScore) {
            if(sStatus) { sStatus.innerText = 'WINNER'; sStatus.className = 'font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.8)]'; }
            if(mStatus) { mStatus.innerText = 'MOGGED'; mStatus.className = 'font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]'; }
            myElo += Math.round(32 * (0 - expected));
        } else {
            if(sStatus) { sStatus.innerText = 'DRAW'; sStatus.className = 'font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-yellow-400'; }
            if(mStatus) { mStatus.innerText = 'DRAW'; mStatus.className = 'font-bold text-2xl tracking-[0.2em] uppercase mt-2 text-yellow-400'; }
        }

        updateUIElo();
        var so = $('stranger-score-overlay'); if(so) { so.style.opacity = '1'; so.style.transform = 'scale(1)'; }
        var lo = $('local-score-overlay'); if(lo) { lo.style.opacity = '1'; lo.style.transform = 'scale(1)'; }
        var btn = $('btn-next-match'); if(btn) { btn.innerText = '⏭️ NEXT MATCH'; btn.style.display = 'flex'; }
    }

    function stopSearching() { isSearching = false; clearInterval(arenaSearchInterval); }

    function exitArena() {
        stopSearching();
        if(currentCall) { try { currentCall.close(); } catch(e){} currentCall = null; }
        if(currentConn) { try { currentConn.close(); } catch(e){} currentConn = null; }
        if(currentPrivateChannel) { try { currentPrivateChannel.unsubscribe(); } catch(e){} currentPrivateChannel = null; }
        if(arenaStream) { var t = arenaStream.getTracks(); for(var i=0;i<t.length;i++) t[i].stop(); arenaStream = null; }
        navigate('menu');
    }

    function resetArenaUI() {
        var so = $('stranger-score-overlay'); if(so) { so.style.opacity = '0'; so.style.transform = 'scale(0.9)'; }
        var lo = $('local-score-overlay'); if(lo) { lo.style.opacity = '0'; lo.style.transform = 'scale(0.9)'; }
        var sv = $('arena-stranger-vid'); if(sv) sv.srcObject = null;
        var btn = $('btn-next-match'); if(btn) { btn.innerText = '❌ CANCEL SEARCH'; btn.style.display = 'flex'; }
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
