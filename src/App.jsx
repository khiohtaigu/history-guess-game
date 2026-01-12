import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { db } from './firebaseConfig';
import { ref, set, onValue, update, get, runTransaction } from "firebase/database";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";

const ROOM_ID_PREFIX = "ROOM_";
const COLORS = { cream: '#FFFDE7', gold: '#FCE38A', green: '#95C173', red: '#950707', text: '#2D2926' };
const FONT_FAMILY = '"Noto Serif TC", "Songti TC", "STSong", "SimSun", "PMingLiU", "serif"';
const iconFilterRed = 'invert(11%) sepia(87%) saturate(6011%) hue-rotate(354deg) brightness(85%) contrast(116%)';
const iconFilterGold = 'invert(88%) sepia(21%) saturate(769%) hue-rotate(344deg) brightness(102%) contrast(101%)';

// --- 版權聲明組件 ---
const CopyrightFooter = () => (
  <div style={footerStyle}>© 2025 你講我臆ＸKhiohtaigu. All Rights Reserved.</div>
);

export default function App() {
  const [view, setView] = useState('HOME'); 
  const [user, setUser] = useState(null);
  const [roomId, setRoomId] = useState(""); 
  const [roomData, setRoomData] = useState(null);
  const [availableCats, setAvailableCats] = useState([]); 
  const [totalSessions, setTotalSessions] = useState(0); 
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef(null);
  const auth = getAuth();

  useEffect(() => {
    document.title = "你講我臆";
    onValue(ref(db, 'stats/totalSessions'), (s) => setTotalSessions(s.val() || 0));
    return auth.onAuthStateChanged(u => setUser(u));
  }, [auth]);

  useEffect(() => {
    onValue(ref(db, 'question_pool'), (snapshot) => {
      if (snapshot.exists()) {
        const pool = snapshot.val();
        const poolArray = Array.isArray(pool) ? pool : Object.values(pool);
        const cats = [...new Set(poolArray.map(item => String(item.book || "").trim()))];
        setAvailableCats(cats);
      }
    });
  }, []);

  useEffect(() => {
    if (!roomId) return;
    const roomRef = ref(db, `rooms/${roomId}`);
    const unsub = onValue(roomRef, (snapshot) => {
      setRoomData(snapshot.val());
    });
    return () => unsub();
  }, [roomId]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = roomData?.isPaused ? true : isMuted;
      audioRef.current.volume = 0.4;
    }
  }, [isMuted, roomData?.isPaused]);

  const handleStartApp = () => {
    if (!user) {
      const provider = new GoogleAuthProvider();
      signInWithPopup(auth, provider).then(() => setView('SUBJECT')).catch(err => alert("登入失敗: " + err.message));
    } else {
      setView('SUBJECT');
    }
    if (audioRef.current) audioRef.current.play().catch(() => {});
  };

  const createRoom = () => {
    const newId = Math.floor(1000 + Math.random() * 9000).toString();
    setRoomId(newId);
    const cat = localStorage.getItem('temp_cat') || "全範圍";
    set(ref(db, `rooms/${newId}`), {
      state: 'SETTINGS',
      currentRound: 1,
      score: 0,
      isPaused: false,
      category: cat,
      hostName: user?.displayName || "老師"
    }).then(() => setView('PROJECTOR_SETTINGS'));
  };

  const resetToHome = async () => {
    if (window.confirm("確定要重置並回到首頁嗎？")) {
      setView('HOME');
      setRoomId("");
      setRoomData(null);
    }
  };

  const renderContent = () => {
    switch (view) {
      case 'ADMIN': return <AdminView onBack={() => setView('HOME')} />;
      case 'HOME': return (
        <div style={lobbyContainer}>
          <div style={glassCard}>
            <div style={titleContainer}><h1 style={responsiveTitle}>你講我臆</h1></div>
            <button style={startBtn} onClick={handleStartApp}>{user ? "進入遊戲 ➔" : "Google 登入開始"}</button>
            {user && <p style={{marginTop: '15px', fontSize: '14px'}}>歡迎，{user.displayName} <span style={{cursor:'pointer', color:COLORS.red}} onClick={()=>signOut(auth)}>(登出)</span></p>}
          </div>
          <button style={adminEntryBtn} onClick={() => setView('ADMIN')}>⚙️ <span style={{fontSize:'16px'}}>題庫匯入</span></button>
          <CopyrightFooter />
        </div>
      );
      case 'SUBJECT': return (
        <div style={lobbyContainer}>
          <div style={glassCard}>
            <h2 style={subTitle}>選擇科目</h2>
            <div style={mobileVerticalGrid}>
              <button style={roleBtnCard} onClick={() => setView('CATEGORY')}><span style={iconLarge}>📜</span> 歷史</button>
              <button style={roleBtnDisabled} disabled><span style={iconLarge}>🌍</span> 地理</button>
              <button style={roleBtnDisabled} disabled><span style={iconLarge}>⚖️</span> 公民</button>
            </div>
            <button style={backLink} onClick={() => setView('HOME')}>← 返回</button>
          </div>
          <CopyrightFooter />
        </div>
      );
      case 'CATEGORY': return (
        <div style={lobbyContainer}>
          <div style={glassCard}>
            <h2 style={subTitle}>選擇範圍</h2>
            <div style={mobileGrid}>
              {["台灣史", "東亞史", "世界史", "歷史選修上", "歷史選修下", "全範圍"].map(cat => {
                const isEnabled = cat === "全範圍" ? availableCats.length > 0 : availableCats.includes(cat);
                return (
                  <button key={cat} style={isEnabled ? catBtnMobile : catBtnDisabled} disabled={!isEnabled}
                    onClick={() => { localStorage.setItem('temp_cat', cat); setView('ROLE'); }}>{cat}</button>
                );
              })}
            </div>
            <button style={backLink} onClick={() => setView('SUBJECT')}>← 返回</button>
          </div>
        </div>
      );
      case 'ROLE': return (
        <div style={lobbyContainer}>
          <div style={glassCard}>
            <h2 style={subTitle}>選擇身分</h2>
            <div style={mobileVerticalGrid}>
              <button style={roleBtnCard} onClick={createRoom}><span style={iconLarge}>💻</span> 我是投影幕 (新房間)</button>
              <button style={roleBtnCard} onClick={() => setView('JOIN_ROOM')}><span style={iconLarge}>📱</span> 我是控制器 (加入)</button>
            </div>
            <button style={backLink} onClick={() => setView('CATEGORY')}>← 返回</button>
          </div>
        </div>
      );
      case 'JOIN_ROOM': return <JoinRoomView setRoomId={setRoomId} setView={setView} />;
      case 'PROJECTOR_SETTINGS': return <ProjectorSettings roomId={roomId} setView={setView} />;
      case 'PROJECTOR_GAME': return <ProjectorGameView roomId={roomId} roomData={roomData} resetToHome={resetToHome} totalSessions={totalSessions} />;
      case 'PLAYER': return <PlayerView roomId={roomId} roomData={roomData} resetSystem={resetToHome} />;
      default: return null;
    }
  };

  return (
    <div style={{fontFamily: FONT_FAMILY, color: COLORS.text, overflowX: 'hidden'}}>
      <audio ref={audioRef} loop src="/bgm.mp3" crossOrigin="anonymous" />
      {renderContent()}
      <button onClick={() => setIsMuted(!isMuted)} style={volumeBtnStyle}>
        <img src="/music.png" alt="music" style={{ width: '100%', height: '100%', filter: isMuted ? 'grayscale(1)' : iconFilterRed, opacity: isMuted ? 0.3 : 1 }} />
      </button>
    </div>
  );
}

// --- 控制器端：輸入代碼 ---
function JoinRoomView({ setRoomId, setView }) {
  const [code, setCode] = useState("");
  const handleJoin = async () => {
    if (code.length < 4) return;
    const s = await get(ref(db, `rooms/${code}`));
    if (s.exists()) { setRoomId(code); setView('PLAYER'); }
    else alert("找不到該房間！");
  };
  return (
    <div style={lobbyContainer}><div style={glassCard}>
      <h2 style={subTitle}>輸入 4 碼房間代碼</h2>
      <input type="number" style={{...inputStyle, width:'200px', fontSize:'3rem', margin:'30px 0'}} value={code} onChange={e=>setCode(e.target.value)} onFocus={e=>e.target.select()} />
      <button style={startBtn} onClick={handleJoin}>進入挑戰 ➔</button>
      <button style={backLink} onClick={()=>setView('ROLE')}>← 返回</button>
    </div></div>
  );
}

// --- 投影幕端：初始設定 ---
function ProjectorSettings({ roomId, setView }) {
  const [rounds, setRounds] = useState(3);
  const [time, setTime] = useState(180);
  const [dup, setDup] = useState(false);

  const saveAndStart = async () => {
    runTransaction(ref(db, 'stats/totalSessions'), (c) => (c || 0) + 1);
    await update(ref(db, `rooms/${roomId}`), {
      state: 'LOBBY', totalRounds: rounds, timePerRound: time, allowDuplicate: dup
    });
    setView('PROJECTOR_GAME');
  };

  return (
    <div style={lobbyContainer}><div style={glassCard}>
      <h1 style={{color: COLORS.red, fontSize:'4rem', margin:0}}>{roomId}</h1>
      <p>請學生輸入以上代碼加入</p>
      <div style={{margin:'30px 0', borderTop:'1px solid #eee', paddingTop:'20px'}}>
        <div style={settingRow}><span>總回合數</span><input type="number" style={inputStyle} value={rounds} onChange={e=>setRounds(parseInt(e.target.value)||0)} onFocus={e=>e.target.select()} /></div>
        <div style={settingRow}><span>每輪秒數</span><input type="number" style={inputStyle} value={time} onChange={e=>setTime(parseInt(e.target.value)||0)} onFocus={e=>e.target.select()} /></div>
        <label style={{display:'block', margin:'20px 0', fontSize:'1.2rem'}}><input type="checkbox" checked={dup} onChange={e=>setDup(e.target.checked)} /> 允許題目重複</label>
      </div>
      <button style={startBtn} onClick={saveAndStart}>儲存設定 ➔</button>
    </div></div>
  );
}

// --- 投影幕端：遊戲主畫面 ---
function ProjectorGameView({ roomId, roomData, resetToHome, totalSessions }) {
  useEffect(() => {
    let timer;
    if (roomData?.state === 'PLAYING' && roomData.timeLeft > 0 && !roomData.isPaused) {
      timer = setInterval(() => update(ref(db, `rooms/${roomId}`), { timeLeft: roomData.timeLeft - 1 }), 1000);
    } else if (roomData?.timeLeft === 0 && roomData.state === 'PLAYING') {
      update(ref(db, `rooms/${roomId}`), { state: 'REVIEW', isPaused: false });
    }
    return () => clearInterval(timer);
  }, [roomId, roomData?.state, roomData?.timeLeft, roomData?.isPaused]);

  if (!roomData) return <div style={lobbyContainer}><h2>📡 資料讀取中...</h2></div>;

  const startRound = async () => {
    const snapshot = await get(ref(db, 'question_pool'));
    const pool = Object.values(snapshot.val() || {});
    let filtered = roomData.category === '全範圍' ? pool : pool.filter(q => q.book === roomData.category);
    if (!roomData.allowDuplicate) filtered = filtered.filter(q => !(roomData.usedIds || []).includes(q.id));
    if (filtered.length === 0) return alert("該範圍題目已用完！");
    const shuffled = filtered.sort(() => Math.random() - 0.5);
    await update(ref(db, `rooms/${roomId}`), { state: 'PLAYING', queue: shuffled, currentIndex: 0, score: 0, history: [], timeLeft: roomData.timePerRound, isPaused: false });
  };

  const confirmResult = async () => {
    const newScores = [...(roomData.roundScores || []), { round: roomData.currentRound, score: roomData.score }];
    const newUsedIds = [...(roomData.usedIds || []), ...(roomData.queue?.slice(0, roomData.currentIndex).map(q => q.id) || [])];
    await update(ref(db, `rooms/${roomId}`), { 
      state: roomData.currentRound >= roomData.totalRounds ? 'TOTAL_END' : 'ROUND_END', 
      roundScores: newScores, usedIds: newUsedIds, isPaused: false 
    });
  };

  if (roomData.state === 'LOBBY' || roomData.state === 'ROUND_END' || roomData.state === 'TOTAL_END') {
    const total = (roomData.roundScores || []).reduce((a, b) => a + b.score, 0);
    return (
      <div style={lobbyContainer}><div style={glassCard}>
          <h1>房間代碼：<span style={{color:COLORS.red}}>{roomId}</span></h1>
          {roomData.state === 'TOTAL_END' ? (
            <div><h1 style={{color:COLORS.red}}>🏆 最終結算</h1>{roomData.roundScores?.map((r,i)=><div key={i}>第 {r.round} 輪：{r.score} 分</div>)}<h2 style={{fontSize:'48px', color:COLORS.green}}>總分：{total}</h2></div>
          ) : <h2 style={{color:COLORS.green, fontSize:'50px'}}>準備就緒 (第 {roomData.currentRound} 輪)</h2>}
          <button style={startBtn} onClick={roomData.state === 'TOTAL_END' ? resetToHome : startRound}>{roomData.state === 'TOTAL_END' ? "回首頁" : "開始挑戰"}</button>
          {roomData.state !== 'TOTAL_END' && <button style={backLink} onClick={resetToHome}>重置回首頁</button>}
      </div><CopyrightFooter /></div>
    );
  }

  const currentQ = roomData.queue?.[roomData.currentIndex];
  const isReview = roomData.state === 'REVIEW';
  const isTimeWarning = roomData.timeLeft <= 10;

  return (
    <div style={gameScreenStyle}>
      <div style={topBar}>
        <div style={infoText}>{roomData.category} | 房號: {roomId}</div>
        <div style={{...infoText, color: isTimeWarning?'#fff':COLORS.gold, display:'flex', alignItems:'center', gap:'10px'}}>
          <img src="/time.png" alt="time" style={{height:'30px', filter:iconFilterGold, animation:(isTimeWarning && !roomData.isPaused)?'ioh-blink 0.5s infinite':'none'}} />
          <span>{roomData.timeLeft}s</span>
        </div>
        <div style={{...infoText, color:COLORS.green, minWidth:'150px'}}>SCORE: {roomData.score}</div>
        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
          {isReview && <button style={confirmBtn} onClick={confirmResult}>確認結算 ➔</button>}
          {!isReview && <button onClick={()=>update(ref(db, `rooms/${roomId}`), {isPaused: !roomData.isPaused})} style={pauseIconBtn}><img src="/pause.png" alt="pause" style={{height:'28px', filter:iconFilterGold, opacity:roomData.isPaused?0.5:1}}/></button>}
          <button style={resetSmallBtn} onClick={resetToHome}>RESET</button>
          <div style={userCounterStyle}><span style={{fontSize:'12px', opacity:0.6}}>累積開局</span><br/><span style={{fontSize:'20px', color: COLORS.gold}}>{totalSessions}次</span></div>
        </div>
      </div>
      <div style={mainContent}>
        <div style={sideColumnPC}><h3 style={columnTitlePC}>正確</h3><div style={listScroll}>{(roomData.history || []).map((h, i) => h.type === '正確' && (<div key={i} style={listItemWhitePC} onClick={() => updateHistory(roomId, roomData, i)}>✓ {h.q}</div>)).reverse()}</div></div>
        <div style={centerColumnPC}>
          {roomData.isPaused ? <h1 style={{fontSize:'100px', color:COLORS.gold}}>暫停中</h1> : <>
            <div style={{fontSize:'32px', color:COLORS.red, marginBottom:'10px', fontWeight:'bold'}}>{currentQ?.category}</div>
            <div style={mainTermContainer}><h1 style={mainTermStylePC(currentQ?.term || "")}>{currentQ?.term}</h1></div>
            {isReview && <div style={{color:COLORS.red, fontSize:'28px', marginTop:'30px', fontWeight:'bold'}}>核對模式：可點擊清單修正</div>}
          </>}
        </div>
        <div style={sideColumnPC}><h3 style={columnTitlePC}>跳過</h3><div style={listScroll}>{(roomData.history || []).map((h, i) => h.type === '跳過' && (<div key={i} style={listItemWhitePC} onClick={() => updateHistory(roomId, roomData, i)}>✘ {h.q}</div>)).reverse()}</div></div>
      </div>
      <CopyrightFooter />
    </div>
  );
}

const updateHistory = (rid, data, idx) => {
  const newH = [...data.history];
  newH[idx].type = newH[idx].type === '正確' ? '跳過' : '正確';
  update(ref(db, `rooms/${rid}`), { history: newH, score: newH.filter(h=>h.type==='正確').length });
};

// --- 控制器端：遊戲畫面 ---
function PlayerView({ roomId, roomData, resetSystem }) {
  const submit = async (type) => {
    if (!roomData || roomData.state !== 'PLAYING' || roomData.isPaused) return;
    const nextIdx = roomData.currentIndex + 1;
    const currentQ = roomData.queue[roomData.currentIndex];
    const newH = [...(roomData.history || []), { q: currentQ.term, type: type }];
    await update(ref(db, `rooms/${roomId}`), { currentIndex: nextIdx, score: type === '正確' ? roomData.score + 1 : roomData.score, history: newH });
  };
  if (!roomData) return <div style={layoutStyleMobile}><h2>📡 連線中 (房號: {roomId})...</h2></div>;
  if (roomData.state !== 'PLAYING') return (
    <div style={layoutStyleMobile}><h2 style={{color:COLORS.red}}>⏳ 等待開始</h2><p>房號：{roomId}</p><p>請等待投影幕端啟動挑戰</p><button style={backLink} onClick={resetSystem}>返回首頁</button></div>
  );
  if (roomData.isPaused) return <div style={layoutStyleMobile}><h1 style={{color:COLORS.red, fontSize:'3rem'}}>暫停中</h1></div>;
  const currentQ = roomData.queue?.[roomData.currentIndex];
  return (
    <div style={layoutStyleMobile}>
      <h2 style={mobileHeader}>房號: {roomId} | 第 {roomData.currentRound} 輪</h2>
      <div style={mobileTermCard}><h2 style={mobileTermText}>{currentQ?.term}</h2></div>
      <div style={mobileButtonArea}>
        <button style={{ ...mobileActionBtn, backgroundColor: COLORS.green }} onClick={() => submit('正確')}>正確</button>
        <button style={{ ...mobileActionBtn, backgroundColor: COLORS.red }} onClick={() => submit('跳過')}>跳過</button>
      </div>
      <CopyrightFooter />
    </div>
  );
}

// --- 管理後台 ---
function AdminView({ onBack }) {
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      let all = [];
      workbook.SheetNames.forEach(n => {
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[n]);
        all = [...all, ...json.map(i => ({ id: i['序號']||Math.random(), term: String(i['名詞']||''), book: String(i['分冊']||'').trim() }))];
      });
      set(ref(db, 'question_pool'), all).then(() => alert("匯入成功！"));
    };
    reader.readAsArrayBuffer(file);
  };
  return <div style={lobbyContainer}><div style={glassCard}><h2>題庫管理</h2><input type="file" onChange={handleFileUpload}/><br/><button style={backLink} onClick={onBack}>← 返回</button></div></div>;
}

// --- 樣式設定 ---
const lobbyContainer = { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:COLORS.cream, position:'relative', padding:'20px', boxSizing:'border-box', textAlign:'center' };
const glassCard = { background:'#fff', padding:'30px 20px', borderRadius:'30px', boxShadow:'0 20px 50px rgba(0,0,0,0.05)', textAlign:'center', width:'95%', maxWidth:'550px', border:`4px solid ${COLORS.gold}`, boxSizing:'border-box' };
const titleContainer = { width:'100%', overflow:'hidden', display:'flex', justifyContent:'center', marginBottom:'30px' };
const responsiveTitle = { fontSize:'clamp(2.5rem, 10vw, 5rem)', fontWeight:'900', color:COLORS.red, letterSpacing:'10px', margin:0 };
const subTitle = { fontSize:'2rem', marginBottom:'25px', color:COLORS.text, fontWeight:'bold' };
const mobileGrid = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px', marginBottom:'25px' };
const mobileVerticalGrid = { display:'flex', flexDirection:'column', gap:'15px', marginBottom:'25px' };
const roleBtnCard = { display:'flex', alignItems:'center', padding:'20px', fontSize:'1.4rem', borderRadius:'20px', border:`2px solid ${COLORS.gold}`, background:'#fff', cursor:'pointer', fontWeight:'bold', color:COLORS.text, fontFamily:FONT_FAMILY };
const iconLarge = { fontSize:'2.5rem', marginRight:'15px' };
const roleBtnDisabled = { ...roleBtnCard, background:'#eee', color:'#aaa', cursor:'not-allowed', border:'none' };
const catBtnMobile = { padding:'15px', fontSize:'1.2rem', borderRadius:'15px', border:`2px solid ${COLORS.gold}`, background:'#fff', fontWeight:'bold', color:COLORS.text, fontFamily:FONT_FAMILY };
const catBtnDisabled = { ...catBtnMobile, background:'#eee', color:'#aaa', cursor:'not-allowed', border:'none' };
const startBtn = { padding:'20px', fontSize:'1.8rem', borderRadius:'20px', border:'none', background:COLORS.gold, color:COLORS.text, fontWeight:'bold', cursor:'pointer', width:'100%' };
const backLink = { background:'none', border:'none', color:'#888', cursor:'pointer', fontSize:'1.1rem', marginTop:'15px' };
const adminEntryBtn = { position:'absolute', bottom:'30px', left:'30px', background:'none', border:'none', display:'flex', alignItems:'center', cursor:'pointer' };
const gameScreenStyle = { display:'flex', flexDirection:'column', height:'100vh', backgroundColor:COLORS.cream, overflow:'hidden' };
const topBar = { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'15px 40px', background:COLORS.text, color:'#fff' };
const infoText = { fontSize:'26px', fontWeight:'bold' };
const mainContent = { display:'flex', flex:1, overflow:'hidden' };
const sideColumnPC = { width:'15%', padding:'20px', background:COLORS.red, display:'flex', flexDirection:'column', color:'#fff', boxSizing:'border-box' };
const columnTitlePC = { fontSize:'28px', borderBottom:'3px solid rgba(255,255,255,0.3)', paddingBottom:'10px', textAlign:'center', fontWeight:'bold', marginBottom:'15px' };
const listItemWhitePC = { fontSize:'28px', padding:'15px', margin:'10px 0', borderRadius:'10px', cursor:'pointer', backgroundColor:'rgba(255,255,255,0.15)', color:'#fff', textAlign:'left', fontWeight:'bold' };
const centerColumnPC = { width:'70%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 80px', boxSizing:'border-box' };
const mainTermContainer = { width:'100%', overflow:'hidden', textAlign:'center' };
const mainTermStylePC = (t) => ({ fontSize: t.length > 12 ? '65px' : t.length > 8 ? '85px' : t.length > 5 ? '120px' : '170px', whiteSpace:'nowrap', fontWeight:'900', color:COLORS.text, margin:0 });
const layoutStyleMobile = { display:'flex', flexDirection:'column', height:'100vh', width:'100vw', background:COLORS.cream, padding:'0 20px', boxSizing:'border-box', textAlign:'center', justifyContent:'flex-start' };
const mobileHeader = { fontSize:'1.5rem', color:COLORS.red, fontWeight:'bold', margin:'30px 0 10px 0' };
const mobileTermCard = { height:'35vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff', borderRadius:'25px', border:`3px solid ${COLORS.gold}`, margin:'10px 0', padding:'20px', width:'100%', boxSizing:'border-box' };
const mobileTermText = { fontSize:'clamp(2rem, 12vw, 3.5rem)', color:COLORS.text, margin:0, fontWeight:'900' };
const mobileButtonArea = { display:'flex', flexDirection:'column', gap:'15px', marginTop:'10px', width:'100%' };
const mobileActionBtn = { padding:'25px 0', fontSize:'2.5rem', borderRadius:'20px', border:'none', color:'#fff', fontWeight:'bold', cursor:'pointer', boxShadow:'0 5px 15px rgba(0,0,0,0.1)' };
const volumeBtnStyle = { position:'fixed', bottom:'15px', right:'15px', width:'55px', height:'55px', background:'white', border:`2px solid ${COLORS.gold}`, borderRadius:'50%', cursor:'pointer', padding:'10px', zIndex:2000, boxShadow:'0 4px 10px rgba(0,0,0,0.1)' };
const pauseIconBtn = { background:'none', border:'none', cursor:'pointer' };
const resetSmallBtn = { padding:'5px 10px', background:'transparent', border:'1px solid #555', color:'#aaa', borderRadius: '4px', cursor: 'pointer' };
const confirmBtn = { padding:'10px 20px', background:COLORS.gold, border:'none', borderRadius:'8px', color:COLORS.text, fontWeight:'bold', cursor:'pointer' };
const inputStyle = { padding:'12px', borderRadius:'10px', border:`2px solid ${COLORS.gold}`, width:'150px', textAlign:'center', fontSize:'1.8rem', backgroundColor:'#fff', color:COLORS.text };
const settingRow = { display:'flex', justifyContent:'space-between', alignItems:'center', margin:'20px 0', width:'100%', fontSize:'1.3rem', fontWeight:'bold' };
const listScroll = { flex:1, overflowY:'auto' };
const footerStyle = { position:'absolute', bottom:'30px', width:'100%', textAlign:'center', fontSize:'12px', color:COLORS.text, opacity:0.5, pointerEvents:'none' };
const userCounterStyle = { textAlign:'right', borderLeft:'1px solid rgba(255,255,255,0.2)', paddingLeft:'15px' };