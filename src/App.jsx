import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { db } from './firebaseConfig';
import { ref, set, onValue, update, get, runTransaction } from "firebase/database";

const ROOM_ID = "ROOM_001"; 

const COLORS = {
  cream: '#FFFDE7',  
  gold: '#FCE38A',   
  green: '#95C173',  
  red: '#950707',    
  text: '#2D2926'    
};

const FONT_FAMILY = '"Noto Serif TC", "Songti TC", "STSong", "SimSun", "PMingLiU", "serif"';

const iconFilterRed = 'invert(11%) sepia(87%) saturate(6011%) hue-rotate(354deg) brightness(85%) contrast(116%)';
const iconFilterGold = 'invert(88%) sepia(21%) saturate(769%) hue-rotate(344deg) brightness(102%) contrast(101%)';

// --- 版權聲明組件 ---
const CopyrightFooter = () => (
  <div style={footerStyle}>
    © 2025 你講我臆ＸKhiohtaigu. All Rights Reserved.
  </div>
);

export default function App() {
  const [view, setView] = useState('HOME'); 
  const [roomData, setRoomData] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [availableCats, setAvailableCats] = useState([]); 
  const [totalUsers, setTotalUsers] = useState(0); 
  const audioRef = useRef(null);

  useEffect(() => {
    document.title = "你講我臆";
    const statsRef = ref(db, 'stats/totalUsers');
    onValue(statsRef, (snapshot) => {
      if (snapshot.exists()) setTotalUsers(snapshot.val());
    });
    const hasVisited = localStorage.getItem('khiohtaigu_visited');
    if (!hasVisited) {
      runTransaction(statsRef, (currentValue) => {
        return (currentValue || 0) + 1;
      }).then(() => {
        localStorage.setItem('khiohtaigu_visited', 'true');
      });
    }
  }, []);

  useEffect(() => {
    const roomRef = ref(db, `rooms/${ROOM_ID}`);
    const poolRef = ref(db, 'question_pool');
    const unsubRoom = onValue(roomRef, (snapshot) => { setRoomData(snapshot.val()); });
    const unsubPool = onValue(poolRef, (snapshot) => {
      if (snapshot.exists()) {
        const pool = snapshot.val();
        const poolArray = Array.isArray(pool) ? pool : Object.values(pool);
        const cats = [...new Set(poolArray.map(item => String(item.book || "").trim()))];
        setAvailableCats(cats);
      }
    });
    return () => { unsubRoom(); unsubPool(); };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = roomData?.isPaused ? true : isMuted;
      audioRef.current.volume = 0.4;
    }
  }, [isMuted, roomData?.isPaused]);

  const handleStartApp = () => {
    setView('SUBJECT');
    if (audioRef.current) audioRef.current.play().catch(e => console.log("Audio deferred"));
  };

  const resetToHome = async () => {
    if (window.confirm("確定要重置並回到首頁嗎？")) {
      await update(ref(db, `rooms/${ROOM_ID}`), {
        state: 'SETTINGS', subject: null, category: null,
        usedIds: [], roundScores: [], currentRound: 1, score: 0, isPaused: false
      });
      setView('HOME');
    }
  };

  const renderContent = () => {
    if (view === 'ADMIN') return <AdminView onBack={() => setView('HOME')} />;
    if (view === 'HOME') return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <div style={titleContainer}><h1 style={responsiveTitle}>你講我臆</h1></div>
          <button style={startBtn} onClick={handleStartApp}>開始挑戰 ➔</button>
        </div>
        <button style={adminEntryBtn} onClick={() => setView('ADMIN')}>
          <span style={{fontSize: '32px'}}>⚙️</span>
          <span style={{fontSize: '16px', marginLeft: '8px', color: '#888'}}>題庫匯入</span>
        </button>
        <CopyrightFooter />
      </div>
    );
    if (view === 'SUBJECT') return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <h2 style={subTitle}>選擇科目</h2>
          <div style={mobileVerticalGrid}>
            <button style={roleBtnCard} onClick={() => setView('CATEGORY')}>
              <span style={iconLarge}>📜</span> 歷史
            </button>
            <button style={roleBtnDisabled} disabled><span style={iconLarge}>🌍</span> 地理</button>
            <button style={roleBtnDisabled} disabled><span style={iconLarge}>⚖️</span> 公民</button>
          </div>
          <button style={backLink} onClick={() => setView('HOME')}>← 返回</button>
        </div>
        <CopyrightFooter />
      </div>
    );
    if (view === 'CATEGORY') {
      const categories = ["台灣史", "東亞史", "世界史", "歷史選修上", "歷史選修下", "全範圍"];
      return (
        <div style={lobbyContainer}>
          <div style={glassCard}>
            <h2 style={subTitle}>選擇範圍</h2>
            <div style={mobileGrid}>
              {categories.map(cat => {
                const isEnabled = cat === "全範圍" ? availableCats.length > 0 : availableCats.includes(cat);
                return (
                  <button key={cat} style={isEnabled ? catBtnMobile : catBtnDisabled} disabled={!isEnabled}
                    onClick={async () => {
                      await update(ref(db, `rooms/${ROOM_ID}`), { subject: '歷史', category: cat });
                      setView('ROLE');
                    }}>{cat}</button>
                );
              })}
            </div>
            <button style={backLink} onClick={() => setView('SUBJECT')}>← 返回</button>
          </div>
          <CopyrightFooter />
        </div>
      );
    }
    if (view === 'ROLE') return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <h2 style={subTitle}>{roomData?.category || "歷史"}<br/>選擇身分</h2>
          <div style={mobileVerticalGrid}>
            <button style={roleBtnCard} onClick={() => setView('PROJECTOR')}>
              <span style={iconLarge}>💻</span> 投影幕端
            </button>
            <button style={roleBtnCard} onClick={() => setView('PLAYER')}>
              <span style={iconLarge}>📱</span> 控制器端
            </button>
          </div>
          <button style={backLink} onClick={() => setView('CATEGORY')}>← 返回</button>
        </div>
        <CopyrightFooter />
      </div>
    );
    if (view === 'PROJECTOR') return <ProjectorView roomData={roomData} resetSystem={resetToHome} totalUsers={totalUsers} />;
    if (view === 'PLAYER') return <PlayerView roomData={roomData} />;
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

// --- 1. 管理後台 ---
function AdminView({ onBack }) {
  const [loading, setLoading] = useState(false);
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      let allQuestions = [];
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);
        allQuestions = [...allQuestions, ...json.map(i => ({
          id: i['序號'] || Math.random(),
          term: String(i['名詞'] || ''),
          book: String(i['分冊'] || '').trim(),
          category: String(i['章節'] || '').trim(),
          keywords: String(i['關鍵字'] || '')
        }))];
      });
      if (allQuestions.length === 0) return alert("無資料");
      if (window.confirm(`讀取到 ${allQuestions.length} 筆，確定匯入？`)) {
        setLoading(true);
        set(ref(db, 'question_pool'), allQuestions).then(() => { alert("成功！"); setLoading(false); });
      }
    };
    reader.readAsArrayBuffer(file);
  };
  return (
    <div style={lobbyContainer}><div style={glassCard}>
      <h2>⚙️ 題庫管理</h2>
      <input type="file" accept=".xlsx" onChange={handleFileUpload} style={{margin: '30px 0'}} disabled={loading} />
      <br/><button style={backLink} onClick={onBack}>← 返回</button>
    </div><CopyrightFooter /></div>
  );
}

// --- 2. 投影幕組件 ---
function ProjectorView({ roomData, resetSystem, totalUsers }) {
  const [tempSettings, setTempSettings] = useState({ rounds: 3, time: 180, dup: false });
  useEffect(() => {
    let timer;
    if (roomData?.state === 'PLAYING' && roomData.timeLeft > 0 && !roomData.isPaused) {
      timer = setInterval(() => update(ref(db, `rooms/${ROOM_ID}`), { timeLeft: roomData.timeLeft - 1 }), 1000);
    } else if (roomData?.timeLeft === 0 && roomData.state === 'PLAYING') {
      update(ref(db, `rooms/${ROOM_ID}`), { state: 'REVIEW', isPaused: false });
    }
    return () => clearInterval(timer);
  }, [roomData?.state, roomData?.timeLeft, roomData?.isPaused]);

  if (!roomData) return <div style={lobbyContainer}>載入中...</div>;

  const startRound = async () => {
    const snapshot = await get(ref(db, 'question_pool'));
    const pool = Object.values(snapshot.val() || {});
    let filtered = roomData.category === '全範圍' ? pool : pool.filter(q => q.book === roomData.category);
    if (!roomData.allowDuplicate) filtered = filtered.filter(q => !(roomData.usedIds || []).includes(q.id));
    if (filtered.length === 0) return alert("題目已用完！");
    const shuffled = filtered.sort(() => Math.random() - 0.5);
    await update(ref(db, `rooms/${ROOM_ID}`), { state: 'PLAYING', queue: shuffled, currentIndex: 0, score: 0, history: [], timeLeft: roomData.timePerRound, isPaused: false });
  };

  const togglePause = () => update(ref(db, `rooms/${ROOM_ID}`), { isPaused: !roomData.isPaused });

  const toggleItem = (idx) => {
    if (!roomData.history) return;
    const newH = [...(roomData.history || [])];
    newH[idx].type = newH[idx].type === '正確' ? '跳過' : '正確';
    update(ref(db, `rooms/${ROOM_ID}`), { history: newH, score: newH.filter(h => h.type === '正確').length });
  };

  if (roomData.state === 'SETTINGS' || !roomData.state) {
    return (
      <div style={lobbyContainer}><div style={glassCard}>
          <h2 style={{...subTitle, color: COLORS.red}}>初始設定</h2>
          <div style={settingRow}><span>總回合</span><input type="number" style={inputStyle} value={tempSettings.rounds} onChange={e => setTempSettings({...tempSettings, rounds: parseInt(e.target.value) || 0})} onFocus={e => e.target.select()} /></div>
          <div style={settingRow}><span>每輪秒數</span><input type="number" style={inputStyle} value={tempSettings.time} onChange={e => setTempSettings({...tempSettings, time: parseInt(e.target.value) || 0})} onFocus={e => e.target.select()} /></div>
          <label style={{display: 'block', margin: '20px 0', fontSize: '1.2rem', cursor: 'pointer'}}><input type="checkbox" checked={tempSettings.dup} onChange={e=>setTempSettings({...tempSettings, dup: e.target.checked})} /> 允許重複</label>
          <button style={{...startBtn, background: COLORS.green}} onClick={() => update(ref(db, `rooms/${ROOM_ID}`), { state: 'LOBBY', totalRounds: tempSettings.rounds, timePerRound: tempSettings.time, allowDuplicate: tempSettings.dup, isPaused: false })}>儲存設定</button>
      </div><CopyrightFooter /></div>
    );
  }

  if (roomData.state === 'LOBBY' || roomData.state === 'ROUND_END' || roomData.state === 'TOTAL_END') {
    const total = (roomData.roundScores || []).reduce((a, b) => a + b.score, 0);
    return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <h1>{roomData.state === 'TOTAL_END' ? "🏆 最終結算" : `第 ${roomData.currentRound} 輪`}</h1>
          {roomData.state === 'TOTAL_END' ? (
            <div style={{margin: '20px 0'}}>
              {roomData.roundScores?.map((r, i) => <div key={i} style={{fontSize: '24px'}}>第 {r.round} 輪：{r.score} 分</div>)}
              <h2 style={{fontSize: '56px', color: COLORS.green, marginTop: '20px'}}>總分：{total}</h2>
            </div>
          ) : <h2 style={{color: COLORS.green, fontSize: '50px'}}>準備就緒</h2>}
          <button style={{...startBtn, background: COLORS.green}} onClick={async () => {
            if(roomData.state === 'ROUND_END') await update(ref(db, `rooms/${ROOM_ID}`), { currentRound: roomData.currentRound + 1 });
            if(roomData.state === 'TOTAL_END') return resetSystem();
            startRound();
          }}>{roomData.state === 'TOTAL_END' ? "重新開始" : "開始挑戰"}</button>
          <button style={backLink} onClick={resetSystem}>重置回首頁</button>
        </div>
        <CopyrightFooter />
      </div>
    );
  }

  const currentQ = roomData.queue?.[roomData.currentIndex];
  const isReview = roomData.state === 'REVIEW';
  const mainTermStyleDynamic = (text) => {
    let size = 170;
    const len = text.length;
    if (len > 12) size = 65; else if (len > 8) size = 85; else if (len > 5) size = 120;
    return { fontSize: size + 'px', whiteSpace: 'nowrap', fontWeight: '900', color: COLORS.text, margin: 0 };
  };

  // --- 閃爍邏輯計算 ---
  // 當小於等於 10 秒且秒數為偶數時，顯示金色；奇數時不套用濾鏡 (原始黑色)
  const isTimeWarning = roomData.timeLeft <= 10;
  const isFlashActive = roomData.timeLeft % 2 === 0;
  const timerIconFilter = isTimeWarning 
    ? (isFlashActive ? iconFilterGold : 'none') 
    : iconFilterGold;

  return (
    <div style={gameScreenStyle}>
      <div style={topBar}>
        <div style={infoText}>{roomData.category} | RD {roomData.currentRound}</div>
        <div style={{...infoText, color: roomData.timeLeft <= 10 ? '#fff' : COLORS.gold, display: 'flex', alignItems: 'center', gap: '10px'}}>
          <img src="/time.png" alt="time" style={{ height: '30px', filter: timerIconFilter }} />
          <span>{roomData.timeLeft}s</span>
        </div>
        <div style={{...infoText, color: COLORS.green, minWidth: '150px'}}>SCORE: {roomData.score}</div>
        
        <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
          {isReview && <button style={confirmBtn} onClick={async () => {
            const newScores = [...(roomData.roundScores || []), { round: roomData.currentRound, score: roomData.score }];
            const newUsedIds = [...(roomData.usedIds || []), ...(roomData.queue?.slice(0, roomData.currentIndex).map(q => q.id) || [])];
            await update(ref(db, `rooms/${ROOM_ID}`), { state: roomData.currentRound >= roomData.totalRounds ? 'TOTAL_END' : 'ROUND_END', roundScores: newScores, usedIds: newUsedIds, isPaused: false });
          }}>確認結算 ➔</button>}
          
          {!isReview && <button onClick={togglePause} style={pauseIconBtn}><img src="/pause.png" alt="pause" style={{ height: '28px', filter: iconFilterGold, opacity: roomData.isPaused ? 0.5 : 1 }} /></button>}
          <button style={resetSmallBtn} onClick={resetSystem}>RESET</button>
          
          <div style={userCounterStyle}>
             <span style={{fontSize: '12px', opacity: 0.6, display: 'block', lineHeight: '1'}}>累積使用</span>
             <span style={{fontSize: '20px', color: COLORS.gold}}>{totalUsers}人</span>
          </div>
        </div>
      </div>

      <div style={mainContent}>
        <div style={sideColumnPC}><h3 style={columnTitlePC}>正確</h3><div style={listScroll}>{(roomData.history || []).map((h, i) => h.type === '正確' && (<div key={i} style={listItemWhitePC} onClick={() => toggleItem(i)}>✓ {h.q}</div>)).reverse()}</div></div>
        <div style={centerColumnPC}>
          {roomData.isPaused ? <h1 style={{fontSize: '100px', color: COLORS.gold}}>遊戲暫停中</h1> : (
            <>
              <div style={{fontSize: '32px', color: COLORS.red, marginBottom: '10px', fontWeight: 'bold'}}>{currentQ?.category}</div>
              <div style={mainTermContainer}><h1 style={mainTermStyleDynamic(currentQ?.term || "")}>{currentQ?.term}</h1></div>
              {isReview && <div style={{color: COLORS.red, fontSize: '28px', marginTop: '30px', fontWeight: 'bold'}}>核對模式：可點擊清單修正</div>}
            </>
          )}
        </div>
        <div style={sideColumnPC}><h3 style={columnTitlePC}>跳過</h3><div style={listScroll}>{(roomData.history || []).map((h, i) => h.type === '跳過' && (<div key={i} style={listItemWhitePC} onClick={() => toggleItem(i)}>✘ {h.q}</div>)).reverse()}</div></div>
      </div>
      <CopyrightFooter />
    </div>
  );
}

// --- 3. 控制器組件 ---
function PlayerView({ roomData }) {
  const handleBtnClick = async (type) => {
    if (!roomData || roomData.state !== 'PLAYING' || !roomData.queue || roomData.isPaused) return;
    const nextIdx = roomData.currentIndex + 1;
    const currentQ = roomData.queue[roomData.currentIndex];
    const newH = [...(roomData.history || []), { q: currentQ.term, type: type }];
    await update(ref(db, `rooms/${ROOM_ID}`), { currentIndex: nextIdx, score: type === '正確' ? roomData.score + 1 : roomData.score, history: newH });
  };
  if (!roomData) return <div style={layoutStyleMobile}><h2>📡 連線中...</h2></div>;
  if (roomData.state !== 'PLAYING' || !roomData.queue) return (
    <div style={layoutStyleMobile}><h2>⏳ 等待開始</h2><p style={{fontSize: '1.2rem'}}>範圍：{roomData.category || '未設定'}</p><CopyrightFooter /></div>
  );
  if (roomData.isPaused) return (
    <div style={layoutStyleMobile}><h1 style={{color: COLORS.red, fontSize: '3rem'}}>暫停中</h1><p>請等待老師恢復遊戲</p><CopyrightFooter /></div>
  );
  const currentQ = roomData.queue[roomData.currentIndex];
  if (!currentQ) return <div style={layoutStyleMobile}><h2>🏁 本輪結束</h2><CopyrightFooter /></div>;
  return (
    <div style={layoutStyleMobile}>
      <h2 style={mobileHeader}>第 {roomData.currentRound} 輪</h2>
      <div style={mobileTermCard}><h2 style={mobileTermText}>{currentQ.term}</h2></div>
      <div style={mobileButtonArea}>
        <button style={{ ...mobileActionBtn, backgroundColor: COLORS.green }} onClick={() => handleBtnClick('正確')}>正確</button>
        <button style={{ ...mobileActionBtn, backgroundColor: COLORS.red }} onClick={() => handleBtnClick('跳過')}>跳過</button>
      </div>
      <CopyrightFooter />
    </div>
  );
}

// --- 樣式設定 ---
const lobbyContainer = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: COLORS.cream, position: 'relative', padding: '20px', boxSizing: 'border-box' };
const glassCard = { background: '#fff', padding: '30px 20px', borderRadius: '30px', boxShadow: '0 20px 50px rgba(0,0,0,0.05)', textAlign: 'center', width: '90%', maxWidth: '500px', border: `4px solid ${COLORS.gold}`, boxSizing: 'border-box' };
const titleContainer = { width: '100%', overflow: 'hidden', display: 'flex', justifyContent: 'center', marginBottom: '30px' };
const responsiveTitle = { fontSize: 'clamp(2.5rem, 10vw, 5.5rem)', fontWeight: '900', color: COLORS.red, letterSpacing: '10px', lineHeight: '1.2', margin: 0 };
const subTitle = { fontSize: '2rem', marginBottom: '25px', color: COLORS.text, fontWeight: 'bold' };
const mobileGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' };
const mobileVerticalGrid = { display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px' };
const roleBtnCard = { display: 'flex', alignItems: 'center', padding: '20px', fontSize: '1.4rem', borderRadius: '20px', border: `2px solid ${COLORS.gold}`, background: '#fff', cursor: 'pointer', fontWeight: 'bold', color: COLORS.text, fontFamily: FONT_FAMILY, boxShadow: '0 4px 10px rgba(0,0,0,0.05)' };
const iconLarge = { fontSize: '2.5rem', marginRight: '15px' };
const roleBtnDisabled = { ...roleBtnCard, background: '#eee', color: '#aaa', cursor: 'not-allowed', border: 'none' };
const catBtnMobile = { padding: '15px', fontSize: '1.2rem', borderRadius: '15px', border: `2px solid ${COLORS.gold}`, background: '#fff', fontWeight: 'bold', color: COLORS.text, fontFamily: FONT_FAMILY };
const catBtnDisabled = { ...catBtnMobile, background: '#eee', color: '#aaa', cursor: 'not-allowed', border: 'none' };
const startBtn = { padding: '20px', fontSize: '1.8rem', borderRadius: '20px', border: 'none', background: COLORS.gold, color: COLORS.text, fontWeight: 'bold', cursor: 'pointer', width: '100%' };
const backLink = { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.1rem', marginTop: '15px' };
const adminEntryBtn = { position: 'absolute', bottom: '30px', left: '30px', background: 'none', border: 'none', display: 'flex', alignItems: 'center', cursor: 'pointer' };

const gameScreenStyle = { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: COLORS.cream, overflow: 'hidden' };
const topBar = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', background: COLORS.text, color: '#fff' };
const infoText = { fontSize: '26px', fontWeight: 'bold' };
const mainContent = { display: 'flex', flex: 1, overflow: 'hidden' };
const sideColumnPC = { width: '15%', padding: '20px', background: COLORS.red, display: 'flex', flexDirection: 'column', color: '#fff', boxSizing: 'border-box' };
const columnTitlePC = { fontSize: '28px', borderBottom: '3px solid rgba(255,255,255,0.3)', paddingBottom: '10px', textAlign: 'center', fontWeight: 'bold', marginBottom: '15px' };
const listItemWhitePC = { fontSize: '28px', padding: '15px', margin: '10px 0', borderRadius: '10px', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', textAlign: 'left', fontWeight: 'bold' };
const centerColumnPC = { width: '70%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 80px', boxSizing: 'border-box' };
const mainTermContainer = { width: '100%', overflow: 'hidden', textAlign: 'center' };
const layoutStyleMobile = { display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: COLORS.cream, padding: '0 20px', boxSizing: 'border-box', textAlign: 'center', justifyContent: 'flex-start' };
const mobileHeader = { fontSize: '1.5rem', color: COLORS.red, fontWeight: 'bold', margin: '30px 0 10px 0' };
const mobileTermCard = { height: '35vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: '25px', border: `3px solid ${COLORS.gold}`, margin: '10px 0', padding: '20px', width: '100%', boxSizing: 'border-box' };
const mobileTermText = { fontSize: 'clamp(2rem, 12vw, 3.5rem)', color: COLORS.text, margin: 0, fontWeight: '900' };
const mobileButtonArea = { display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px', width: '100%' };
const mobileActionBtn = { padding: '25px 0', fontSize: '2.5rem', borderRadius: '20px', border: 'none', color: '#fff', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 5px 15px rgba(0,0,0,0.1)' };
const volumeBtnStyle = { position: 'fixed', bottom: '15px', right: '15px', width: '55px', height: '55px', background: 'white', border: `2px solid ${COLORS.gold}`, borderRadius: '50%', cursor: 'pointer', padding: '10px', zIndex: 2000, boxShadow: '0 4px 10px rgba(0,0,0,0.1)' };
const pauseIconBtn = { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' };
const resetSmallBtn = { padding: '5px 10px', background: 'transparent', border: '1px solid #555', color: '#aaa', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' };
const confirmBtn = { padding: '10px 20px', background: COLORS.gold, border: 'none', borderRadius: '8px', color: COLORS.text, fontWeight: 'bold', cursor: 'pointer' };
const inputStyle = { padding: '12px', borderRadius: '10px', border: `2px solid ${COLORS.gold}`, width: '150px', textAlign: 'center', fontSize: '1.8rem', backgroundColor: '#fff', color: COLORS.text, cursor: 'text' };
const settingRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0', width: '100%', fontSize: '1.3rem', fontWeight: 'bold' };
const listScroll = { flex: 1, overflowY: 'auto' };

const footerStyle = {
  position: 'absolute',
  bottom: '30px', 
  width: '100%',
  textAlign: 'center',
  fontSize: '12px',
  color: COLORS.text,
  opacity: 0.5,
  letterSpacing: '1px',
  pointerEvents: 'none'
};

const userCounterStyle = {
  textAlign: 'right',
  borderLeft: '1px solid rgba(255,255,255,0.2)',
  paddingLeft: '15px',
  marginLeft: '5px'
};