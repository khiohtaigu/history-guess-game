import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { db } from './firebaseConfig';
import { ref, set, onValue, update, get } from "firebase/database";

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

export default function App() {
  const [view, setView] = useState('HOME'); 
  const [roomData, setRoomData] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [availableCats, setAvailableCats] = useState([]); 
  const audioRef = useRef(null);
  const roomDataRef = useRef(null);

  useEffect(() => {
    const roomRef = ref(db, `rooms/${ROOM_ID}`);
    const poolRef = ref(db, 'question_pool');

    const unsubRoom = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      setRoomData(data);
      roomDataRef.current = data;
    });

    const unsubPool = onValue(poolRef, (snapshot) => {
      if (snapshot.exists()) {
        const pool = snapshot.val();
        const cats = [...new Set(Object.values(pool).map(item => String(item.book || "").trim()))];
        setAvailableCats(cats);
      }
    });

    return () => { unsubRoom(); unsubPool(); };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      audioRef.current.volume = 0.4;
    }
  }, [isMuted]);

  const resetToHome = async () => {
    if (window.confirm("確定要重置並回到首頁嗎？")) {
      await update(ref(db, `rooms/${ROOM_ID}`), {
        state: 'SETTINGS', subject: null, category: null,
        usedIds: [], roundScores: [], currentRound: 1, score: 0
      });
      setView('HOME');
    }
  };

  const VolumeControl = () => (
    <button onClick={() => setIsMuted(!isMuted)} style={volumeBtnStyle}>
      <img src="/music.png" alt="music" style={{ width: '100%', height: '100%', filter: isMuted ? 'grayscale(1)' : iconFilterRed, opacity: isMuted ? 0.3 : 1 }} />
    </button>
  );

  const renderContent = () => {
    if (view === 'ADMIN') return <AdminView onBack={() => setView('HOME')} />;
    
    if (view === 'HOME') return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <div style={titleContainer}>
             <h1 style={responsiveTitle}>你講我臆</h1>
          </div>
          <button style={startBtn} onClick={() => {
            setView('SUBJECT');
            if (audioRef.current) audioRef.current.play().catch(() => {}); 
          }}>開始挑戰 ➔</button>
        </div>
        <button style={adminEntryBtn} onClick={() => setView('ADMIN')}>⚙️</button>
        <VolumeControl />
      </div>
    );

    if (view === 'SUBJECT') return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <h2 style={subTitle}>選擇科目</h2>
          <div style={mobileGrid}>
            <button style={roleBtn} onClick={() => setView('CATEGORY')}>📜 歷史</button>
            <button style={roleBtnDisabled} disabled>🌍 地理</button>
            <button style={roleBtnDisabled} disabled>⚖️ 公民</button>
          </div>
          <button style={backLink} onClick={() => setView('HOME')}>← 返回</button>
        </div>
        <VolumeControl />
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
          <VolumeControl />
        </div>
      );
    }

    if (view === 'ROLE') return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <h2 style={subTitle}>{roomData?.category || "歷史"}<br/>選擇身分</h2>
          <div style={mobileGrid}>
            <button style={roleBtn} onClick={() => setView('PROJECTOR')}>💻 投影幕端</button>
            <button style={roleBtn} onClick={() => setView('PLAYER')}>📱 控制器端</button>
          </div>
          <button style={backLink} onClick={() => setView('CATEGORY')}>← 返回</button>
        </div>
        <VolumeControl />
      </div>
    );

    if (view === 'PROJECTOR') return <ProjectorView roomData={roomData} resetSystem={resetToHome} volumeComp={<VolumeControl />} />;
    if (view === 'PLAYER') return <PlayerView roomDataRef={roomDataRef} volumeComp={<VolumeControl />} />;
  };

  return (
    <div style={{fontFamily: FONT_FAMILY, color: COLORS.text, overflowX: 'hidden'}}>
      <audio ref={audioRef} loop preload="auto">
        <source src="/bgm.mp3" type="audio/mpeg" />
      </audio>
      {renderContent()}
    </div>
  );
}

// --- 1. 管理後台 (多分頁支援) ---
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
        const formatted = json.map(i => ({
          id: i['序號'] || Math.random(),
          term: String(i['名詞'] || ''),
          book: String(i['分冊'] || '').trim(),
          category: String(i['章節'] || '').trim(),
          keywords: String(i['關鍵字'] || '')
        }));
        allQuestions = [...allQuestions, ...formatted];
      });
      if (allQuestions.length === 0) return alert("讀取不到任何題目。");
      if (window.confirm(`讀取到 ${allQuestions.length} 筆，確定匯入？`)) {
        setLoading(true);
        set(ref(db, 'question_pool'), allQuestions).then(() => {
          alert("匯入成功！");
          setLoading(false);
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };
  return (
    <div style={lobbyContainer}>
      <div style={glassCard}>
        <h2>⚙️ 題庫管理</h2>
        <input type="file" accept=".xlsx" onChange={handleFileUpload} style={{margin: '30px 0'}} disabled={loading} />
        <br/><button style={backLink} onClick={onBack}>← 返回</button>
      </div>
    </div>
  );
}

// --- 2. 投影幕組件 (強化 PC 端佈局) ---
function ProjectorView({ roomData, resetSystem, volumeComp }) {
  const [tempSettings, setTempSettings] = useState({ rounds: 3, time: 180, dup: false });

  useEffect(() => {
    let timer;
    if (roomData?.state === 'PLAYING' && roomData.timeLeft > 0) {
      timer = setInterval(() => update(ref(db, `rooms/${ROOM_ID}`), { timeLeft: roomData.timeLeft - 1 }), 1000);
    } else if (roomData?.timeLeft === 0 && roomData.state === 'PLAYING') {
      update(ref(db, `rooms/${ROOM_ID}`), { state: 'REVIEW' });
    }
    return () => clearInterval(timer);
  }, [roomData?.state, roomData?.timeLeft]);

  const startRound = async () => {
    const snapshot = await get(ref(db, 'question_pool'));
    const pool = Object.values(snapshot.val() || {});
    let filtered = roomData.category === '全範圍' ? pool : pool.filter(q => q.book === roomData.category);
    if (!roomData.allowDuplicate) filtered = filtered.filter(q => !(roomData.usedIds || []).includes(q.id));
    if (filtered.length === 0) return alert("該範圍題目已用完！");
    const shuffled = filtered.sort(() => Math.random() - 0.5);
    await update(ref(db, `rooms/${ROOM_ID}`), { state: 'PLAYING', queue: shuffled, currentIndex: 0, score: 0, history: [], timeLeft: roomData.timePerRound });
  };

  const toggleItem = (idx) => {
    if (!roomData.history) return;
    const newH = [...roomData.history];
    newH[idx].type = newH[idx].type === '正確' ? '跳過' : '正確';
    update(ref(db, `rooms/${ROOM_ID}`), { history: newH, score: newH.filter(h => h.type === '正確').length });
  };

  if (!roomData) return <div style={lobbyContainer}>載入中...</div>;

  if (roomData.state === 'SETTINGS' || !roomData.state) {
    return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <h2 style={{...subTitle, color: COLORS.red}}>初始設定</h2>
          <div style={settingRow}><span>總回合數</span><input type="number" style={inputStyle} value={tempSettings.rounds} onChange={e => setTempSettings({...tempSettings, rounds: parseInt(e.target.value) || 0})} onFocus={e => e.target.select()} /></div>
          <div style={settingRow}><span>每輪秒數</span><input type="number" style={inputStyle} value={tempSettings.time} onChange={e => setTempSettings({...tempSettings, time: parseInt(e.target.value) || 0})} onFocus={e => e.target.select()} /></div>
          <label style={{display: 'block', margin: '20px 0', cursor: 'pointer'}}><input type="checkbox" checked={tempSettings.dup} onChange={e=>setTempSettings({...tempSettings, dup: e.target.checked})} /> 允許重複</label>
          <button style={{...startBtn, background: COLORS.green}} onClick={() => update(ref(db, `rooms/${ROOM_ID}`), { state: 'LOBBY', totalRounds: tempSettings.rounds, timePerRound: tempSettings.time, allowDuplicate: tempSettings.dup })}>儲存設定</button>
        </div>
        {volumeComp}
      </div>
    );
  }

  if (roomData.state === 'LOBBY' || roomData.state === 'ROUND_END' || roomData.state === 'TOTAL_END') {
    const total = (roomData.roundScores || []).reduce((a, b) => a + b.score, 0);
    return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <h1>{roomData.state === 'TOTAL_END' ? "🏆 最終結算" : roomData.state === 'ROUND_END' ? `第 ${roomData.currentRound} 輪結束` : "準備就緒"}</h1>
          {roomData.state === 'TOTAL_END' ? (
            <div style={{margin: '20px 0'}}>
              {roomData.roundScores?.map((r, i) => <div key={i} style={{fontSize: '24px'}}>第 {r.round} 輪：{r.score} 分</div>)}
              <h2 style={{fontSize: '56px', color: COLORS.green, marginTop: '20px'}}>總分：{total}</h2>
            </div>
          ) : (
            <h2 style={{margin: '30px 0', color: COLORS.green, fontSize: '60px'}}>第 {roomData.state === 'ROUND_END' ? roomData.currentRound + 1 : roomData.currentRound} 輪</h2>
          )}
          <button style={{...startBtn, background: COLORS.green}} onClick={async () => {
            if(roomData.state === 'ROUND_END') await update(ref(db, `rooms/${ROOM_ID}`), { currentRound: roomData.currentRound + 1 });
            if(roomData.state === 'TOTAL_END') return resetSystem();
            startRound();
          }}>{roomData.state === 'TOTAL_END' ? "重新開始" : "開始挑戰"}</button>
          <button style={backLink} onClick={resetSystem}>重置回首頁</button>
        </div>
        {volumeComp}
      </div>
    );
  }

  const currentQ = roomData.queue?.[roomData.currentIndex];
  const isReview = roomData.state === 'REVIEW';

  return (
    <div style={gameScreenStyle}>
      <div style={topBar}>
        <div style={infoText}>{roomData.category} | RD {roomData.currentRound}</div>
        <div style={{...infoText, color: roomData.timeLeft <= 10 ? '#fff' : COLORS.gold, display: 'flex', alignItems: 'center', gap: '10px'}}>
          <img src="/time.png" alt="time" style={{ height: '30px', filter: roomData.timeLeft <= 10 ? 'none' : iconFilterGold }} />
          <span>{roomData.timeLeft}s</span>
        </div>
        <div style={{...infoText, color: COLORS.green}}>SCORE: {roomData.score}</div>
        {isReview && <button style={confirmBtn} onClick={async () => {
          const newScores = [...(roomData.roundScores || []), { round: roomData.currentRound, score: roomData.score }];
          const newUsedIds = [...(roomData.usedIds || []), ...(roomData.queue?.slice(0, roomData.currentIndex).map(q => q.id) || [])];
          await update(ref(db, `rooms/${ROOM_ID}`), { state: roomData.currentRound >= roomData.totalRounds ? 'TOTAL_END' : 'ROUND_END', roundScores: newScores, usedIds: newUsedIds });
        }}>確認結算 ➔</button>}
        <button style={resetSmallBtn} onClick={resetSystem}>RESET</button>
      </div>
      <div style={mainContent}>
        {/* 左側清單 */}
        <div style={sideColumnPC}>
          <h3 style={columnTitlePC}>正確</h3>
          <div style={listScroll}>
            {(roomData.history || []).map((h, i) => h.type === '正確' && (
              <div key={i} style={listItemWhitePC} onClick={() => toggleItem(i)}>✓ {h.q}</div>
            )).reverse()}
          </div>
        </div>

        {/* 中間題目 (強化防護) */}
        <div style={centerColumnPC}>
          <div style={{fontSize: '36px', color: COLORS.red, marginBottom: '20px', fontWeight: 'bold'}}>{currentQ?.category}</div>
          <div style={mainTermContainer}>
             <h1 style={mainTermStylePC(currentQ?.term || "")}>{currentQ?.term}</h1>
          </div>
          {isReview && <div style={{color: COLORS.red, fontSize: '28px', marginTop: '30px', fontWeight: 'bold'}}>核對模式：可點擊清單修正</div>}
        </div>

        {/* 右側清單 */}
        <div style={sideColumnPC}>
          <h3 style={columnTitlePC}>跳過</h3>
          <div style={listScroll}>
            {(roomData.history || []).map((h, i) => h.type === '跳過' && (
              <div key={i} style={listItemWhitePC} onClick={() => toggleItem(i)}>✘ {h.q}</div>
            )).reverse()}
          </div>
        </div>
      </div>
      {volumeComp}
    </div>
  );
}

// --- 3. 控制器組件 ---
function PlayerView({ roomDataRef, volumeComp }) {
  const submit = async (type) => {
    const data = roomDataRef.current;
    if (!data || data.state !== 'PLAYING' || !data.queue) return;
    const nextIdx = data.currentIndex + 1;
    const currentQ = data.queue[data.currentIndex];
    const newH = [...(data.history || []), { q: currentQ.term, type: type }];
    await update(ref(db, `rooms/${ROOM_ID}`), { currentIndex: nextIdx, score: type === '正確' ? data.score + 1 : data.score, history: newH });
  };
  const data = roomDataRef.current;
  if (!data || data.state !== 'PLAYING') return (
    <div style={layoutStyleMobile}>
      <h2>⏳ 等待開始</h2>
      <p style={{fontSize: '1.2rem'}}>範圍：{data?.category || '未設定'}</p>
      {volumeComp}
    </div>
  );
  return (
    <div style={layoutStyleMobile}>
      <h2 style={{fontSize: '24px', color: COLORS.red, position: 'absolute', top: '20px'}}>第 {data.currentRound} 輪</h2>
      <div style={mobileTermCard}>
         <h2 style={mobileTermText}>{data.queue?.[data.currentIndex]?.term}</h2>
      </div>
      <div style={mobileButtonArea}>
        <button style={{ ...mobileActionBtn, backgroundColor: COLORS.green }} onClick={() => submit('正確')}>正確</button>
        <button style={{ ...mobileActionBtn, backgroundColor: COLORS.red }} onClick={() => submit('跳過')}>跳過</button>
      </div>
      {volumeComp}
    </div>
  );
}

// --- 4. 樣式系統 ---
const lobbyContainer = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: COLORS.cream, position: 'relative', padding: '20px', boxSizing: 'border-box' };
const glassCard = { background: '#fff', padding: '40px 20px', borderRadius: '30px', boxShadow: '0 20px 50px rgba(0,0,0,0.05)', textAlign: 'center', width: '90%', maxWidth: '600px', border: `4px solid ${COLORS.gold}`, boxSizing: 'border-box' };

// 修正後的標題
const titleContainer = { width: '100%', overflow: 'hidden', display: 'flex', justifyContent: 'center', marginBottom: '30px' };
const responsiveTitle = {
  fontSize: 'clamp(2.5rem, 10vw, 5.5rem)',
  fontWeight: '900',
  color: COLORS.red,
  letterSpacing: '10px',
  lineHeight: '1.2',
  margin: 0
};

const subTitle = { fontSize: '2rem', marginBottom: '25px', color: COLORS.text, fontWeight: 'bold' };
const mobileGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '25px' };
const roleBtn = { padding: '20px', fontSize: '1.4rem', borderRadius: '15px', border: `2px solid ${COLORS.gold}`, background: '#fff', cursor: 'pointer', fontWeight: 'bold', color: COLORS.text, fontFamily: FONT_FAMILY };
const catBtnMobile = { ...roleBtn, fontSize: '1.2rem' };
const catBtnDisabled = { ...catBtnMobile, background: '#eee', color: '#aaa', cursor: 'not-allowed', border: 'none' };
const roleBtnDisabled = { ...roleBtn, background: '#eee', color: '#aaa', cursor: 'not-allowed', border: 'none' };
const startBtn = { padding: '20px', fontSize: '1.8rem', borderRadius: '20px', border: 'none', background: COLORS.gold, color: COLORS.text, fontWeight: 'bold', cursor: 'pointer', width: '100%' };
const backLink = { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.1rem', marginTop: '15px' };
const adminEntryBtn = { position: 'absolute', bottom: '20px', left: '20px', background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', opacity: 0.3 };

// PC 專屬 15/70/15 配置
const gameScreenStyle = { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: COLORS.cream, overflow: 'hidden' };
const topBar = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 40px', background: COLORS.text, color: '#fff' };
const infoText = { fontSize: '26px', fontWeight: 'bold' };
const mainContent = { display: 'flex', flex: 1, overflow: 'hidden' };

const sideColumnPC = { width: '15%', padding: '20px', background: COLORS.red, display: 'flex', flexDirection: 'column', color: '#fff', boxSizing: 'border-box' };
const columnTitlePC = { fontSize: '28px', borderBottom: '3px solid rgba(255,255,255,0.3)', paddingBottom: '10px', textAlign: 'center', fontWeight: 'bold', marginBottom: '15px' };
const listItemWhitePC = { fontSize: '28px', padding: '15px', margin: '10px 0', borderRadius: '10px', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', textAlign: 'left', fontWeight: 'bold' };

const centerColumnPC = { width: '70%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 60px', boxSizing: 'border-box', position: 'relative' };
const mainTermContainer = { width: '100%', maxWidth: '100%', overflow: 'hidden', textAlign: 'center' };
const mainTermStylePC = (text) => ({ 
  // 針對極長名詞進行分段字體縮放
  fontSize: text.length > 12 ? '65px' : text.length > 8 ? '85px' : text.length > 5 ? '120px' : '170px', 
  whiteSpace: 'nowrap', 
  fontWeight: '900', 
  color: COLORS.text, 
  margin: 0,
  textAlign: 'center'
});

// 手機端
const mobilePlayerContainer = { display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: COLORS.cream, padding: '20px', boxSizing: 'border-box', textAlign: 'center' };
const mobileTermCard = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: '25px', border: `3px solid ${COLORS.gold}`, margin: '20px 0', padding: '20px' };
const mobileTermText = { fontSize: 'clamp(2rem, 12vw, 3.5rem)', color: COLORS.text, margin: 0, fontWeight: '900' };
const mobileHeader = { fontSize: '1.2rem', color: COLORS.red, fontWeight: 'bold', marginBottom: '10px' };
const mobileButtonArea = { display: 'flex', flexDirection: 'column', gap: '15px', paddingBottom: '40px' };
const mobileActionBtn = { padding: '25px 0', fontSize: '2rem', borderRadius: '20px', border: 'none', color: '#fff', fontWeight: 'bold', cursor: 'pointer' };

const resetSmallBtn = { padding: '5px 10px', background: 'transparent', border: '1px solid #555', color: '#aaa', borderRadius: '4px', cursor: 'pointer' };
const confirmBtn = { padding: '10px 20px', background: COLORS.gold, border: 'none', borderRadius: '8px', color: COLORS.text, fontWeight: 'bold', cursor: 'pointer' };
const inputStyle = { padding: '12px', borderRadius: '10px', border: `2px solid ${COLORS.gold}`, width: '150px', textAlign: 'center', fontSize: '1.8rem', fontFamily: FONT_FAMILY, backgroundColor: '#fff', color: COLORS.text, cursor: 'text' };
const settingRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0', width: '100%', fontSize: '1.3rem', fontWeight: 'bold' };
const volumeBtnStyle = { position: 'absolute', bottom: '20px', right: '20px', width: '60px', height: '60px', background: 'white', border: `2px solid ${COLORS.gold}`, borderRadius: '50%', cursor: 'pointer', padding: '12px', zIndex: 1000, boxShadow: '0 4px 10px rgba(0,0,0,0.1)' };
const listScroll = { flex: 1, overflowY: 'auto' };