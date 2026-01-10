import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebaseConfig';
import { ref, set, onValue, update, get } from "firebase/database";

const ROOM_ID = "ROOM_001"; 

export default function App() {
  const [role, setRole] = useState(null); 
  const [roomData, setRoomData] = useState(null);
  const roomDataRef = useRef(null);

  useEffect(() => {
    const roomRef = ref(db, `rooms/${ROOM_ID}`);
    return onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      setRoomData(data);
      roomDataRef.current = data;
    });
  }, []);

  const resetSystem = async () => {
    if (window.confirm("確定要重置所有遊戲設定與分數嗎？")) {
      await set(ref(db, `rooms/${ROOM_ID}`), {
        state: 'SETTINGS', totalRounds: 3, timePerRound: 180,
        allowDuplicate: false, usedIds: [], roundScores: [], currentRound: 1
      });
    }
  };

  const startRound = async () => {
    const snapshot = await get(ref(db, 'question_pool'));
    if (!snapshot.exists()) return alert("請先匯入題庫！");
    const pool = Object.values(snapshot.val());
    const settings = roomDataRef.current;
    let availablePool = settings.allowDuplicate ? pool : pool.filter(q => !(settings.usedIds || []).includes(q.id));
    if (availablePool.length === 0) return alert("題目已用完！");
    const shuffled = availablePool.sort(() => Math.random() - 0.5);

    await update(ref(db, `rooms/${ROOM_ID}`), {
      state: 'PLAYING', queue: shuffled, currentIndex: 0,
      score: 0, history: [], timeLeft: settings.timePerRound
    });
  };

  if (!role) {
    return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <h1 style={titleStyle}>台灣史「你講我猜」</h1>
          <div style={{display: 'flex', gap: '20px', justifyContent: 'center'}}>
            <button style={roleBtn} onClick={() => setRole('projector')}>💻 投影幕端</button>
            <button style={roleBtn} onClick={() => setRole('player')}>📱 控制器端</button>
          </div>
        </div>
      </div>
    );
  }

  return role === 'projector' ? 
    <ProjectorView roomData={roomData} startRound={startRound} resetSystem={resetSystem} /> : 
    <PlayerView roomDataRef={roomDataRef} />;
}

// --- 投影幕組件 ---
function ProjectorView({ roomData, startRound, resetSystem }) {
  const [settings, setSettings] = useState({ rounds: 3, time: 180, dup: false });

  useEffect(() => {
    let timer;
    if (roomData?.state === 'PLAYING' && roomData.timeLeft > 0) {
      timer = setInterval(() => {
        update(ref(db, `rooms/${ROOM_ID}`), { timeLeft: roomData.timeLeft - 1 });
      }, 1000);
    } else if (roomData?.timeLeft === 0 && roomData.state === 'PLAYING') {
      update(ref(db, `rooms/${ROOM_ID}`), { state: 'REVIEW' }); 
    }
    return () => clearInterval(timer);
  }, [roomData?.state, roomData?.timeLeft]);

  // --- 即時修正功能：隨時可點擊切換 ---
  const toggleHistoryItem = async (actualIndex) => {
    const newHistory = [...roomData.history];
    const item = newHistory[actualIndex];
    item.type = item.type === '正確' ? '跳過' : '正確';
    const newScore = newHistory.filter(h => h.type === '正確').length;
    await update(ref(db, `rooms/${ROOM_ID}`), { history: newHistory, score: newScore });
  };

  const confirmResult = async () => {
    const data = roomData;
    const roundScore = { round: data.currentRound, score: data.score };
    const newRoundScores = [...(data.roundScores || []), roundScore];
    const newUsedIds = [...(data.usedIds || []), ...data.queue.slice(0, data.currentIndex).map(q => q.id)];
    await update(ref(db, `rooms/${ROOM_ID}`), {
      state: data.currentRound >= data.totalRounds ? 'TOTAL_END' : 'ROUND_END',
      roundScores: newRoundScores, usedIds: newUsedIds
    });
  };

  if (!roomData || roomData.state === 'SETTINGS') {
    return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <h2 style={{marginBottom: '30px', color: '#333'}}>遊戲初始設定</h2>
          <div style={settingRow}><span>總回合數</span><input type="number" style={inputStyle} value={settings.rounds} onChange={e=>setSettings({...settings, rounds: parseInt(e.target.value)})} /></div>
          <div style={settingRow}><span>每輪秒數</span><input type="number" style={inputStyle} value={settings.time} onChange={e=>setSettings({...settings, time: parseInt(e.target.value)})} /></div>
          <label style={{display: 'block', margin: '20px 0', cursor: 'pointer', fontSize: '18px'}}><input type="checkbox" checked={settings.dup} onChange={e=>setSettings({...settings, dup: e.target.checked})} /> 允許題目重複</label>
          <button style={startBtn} onClick={async () => {
            await update(ref(db, `rooms/${ROOM_ID}`), { state: 'LOBBY', totalRounds: settings.rounds, timePerRound: settings.time, allowDuplicate: settings.dup, currentRound: 1, roundScores: [], usedIds: [] });
          }}>儲存設定</button>
        </div>
      </div>
    );
  }

  if (roomData.state === 'LOBBY' || roomData.state === 'ROUND_END' || roomData.state === 'TOTAL_END') {
    if (roomData.state === 'TOTAL_END') {
      const total = roomData.roundScores.reduce((a, b) => a + b.score, 0);
      return (
        <div style={lobbyContainer}>
          <div style={glassCard}>
            <h1 style={{fontSize: '48px'}}>🏆 總結算</h1>
            {roomData.roundScores.map((r, i) => <div key={i} style={{fontSize: '24px'}}>第 {r.round} 輪：{r.score} 分</div>)}
            <h2 style={{fontSize: '56px', color: '#1890ff', marginTop: '20px'}}>總分：{total}</h2>
            <button style={startBtn} onClick={resetSystem}>重新開始</button>
          </div>
        </div>
      );
    }
    return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <h1>{roomData.state === 'ROUND_END' ? `第 ${roomData.currentRound} 輪結束` : "準備就緒"}</h1>
          <h2 style={{margin: '20px', color: '#1890ff'}}>即將進行：第 {roomData.state === 'ROUND_END' ? roomData.currentRound + 1 : roomData.currentRound} 輪</h2>
          <button style={startBtn} onClick={async () => {
            if(roomData.state === 'ROUND_END') await update(ref(db, `rooms/${ROOM_ID}`), { currentRound: roomData.currentRound + 1 });
            startRound();
          }}>開始挑戰</button>
          <button style={{...startBtn, background: '#888', marginTop: '10px'}} onClick={resetSystem}>重置</button>
        </div>
      </div>
    );
  }

  const currentQ = roomData.queue?.[roomData.currentIndex];
  const isReview = roomData.state === 'REVIEW';

  return (
    <div style={gameScreenStyle}>
      <div style={topBar}>
        <div style={infoText}>ROUND {roomData.currentRound} / {roomData.totalRounds}</div>
        <div style={{...infoText, color: roomData.timeLeft <= 10 ? 'red' : 'white'}}>⏳ {roomData.timeLeft}s</div>
        <div style={{...infoText, color: '#ffec3d'}}>SCORE: {roomData.score}</div>
        {isReview && <button style={confirmBtn} onClick={confirmResult}>確認結算 ➔</button>}
      </div>
      
      <div style={mainContent}>
        {/* 左側：最新顯示在最上面 */}
        <div style={sideColumn}>
          <h3 style={{color: '#52c41a', borderBottom: '2px solid #52c41a', paddingBottom: '10px', fontSize: '20px'}}>正確</h3>
          <div style={listScroll}>
            {[...(roomData.history || [])].map((h, i) => h.type === '正確' && (
              <div key={i} style={listItemGreen} onClick={() => toggleHistoryItem(i)}>{h.q}</div>
            )).reverse()}
          </div>
        </div>

        <div style={centerColumn}>
          <div style={{fontSize: '32px', color: '#555', marginBottom: '10px'}}>{currentQ?.category}</div>
          <div style={mainTermWrapper}>
            <h1 style={mainTermStyle(currentQ?.term || "")}>{currentQ?.term}</h1>
          </div>
          {isReview && <div style={{color: '#ffec3d', fontSize: '24px', marginTop: '20px'}}>核對模式：點擊兩側可修正</div>}
        </div>

        <div style={sideColumn}>
          <h3 style={{color: '#ff4d4f', borderBottom: '2px solid #ff4d4f', paddingBottom: '10px', fontSize: '20px'}}>跳過</h3>
          <div style={listScroll}>
            {[...(roomData.history || [])].map((h, i) => h.type === '跳過' && (
              <div key={i} style={listItemRed} onClick={() => toggleHistoryItem(i)}>{h.q}</div>
            )).reverse()}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- 控制器 ---
function PlayerView({ roomDataRef }) {
  const submitAction = async (type) => {
    const data = roomDataRef.current;
    if (!data || data.state !== 'PLAYING') return;
    const nextIndex = data.currentIndex + 1;
    const currentQ = data.queue[data.currentIndex];
    const newHistory = [...(data.history || []), { q: currentQ.term, type: type }];
    await update(ref(db, `rooms/${ROOM_ID}`), {
      currentIndex: nextIndex, score: type === '正確' ? data.score + 1 : data.score, history: newHistory
    });
  };
  const data = roomDataRef.current;
  if (!data || data.state !== 'PLAYING') return <div style={layoutStyle}><h2>等待老師開始...</h2></div>;
  return (
    <div style={{ ...layoutStyle, backgroundColor: '#1890ff', color: '#fff' }}>
      <h2 style={{fontSize: '42px', marginBottom: '50px'}}>{data.queue?.[data.currentIndex]?.term}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '85%' }}>
        <button style={{ ...controlBtn, backgroundColor: '#52c41a' }} onClick={() => submitAction('正確')}>正確</button>
        <button style={{ ...controlBtn, backgroundColor: '#ff4d4f' }} onClick={() => submitAction('跳過')}>跳過</button>
      </div>
    </div>
  );
}

// --- 樣式設定 ---
const lobbyContainer = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f0f2f5' };
const glassCard = { background: 'white', padding: '40px', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)', textAlign: 'center', minWidth: '400px' };
const titleStyle = { fontSize: '36px', fontWeight: '900', marginBottom: '30px' };
const settingRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0' };
const inputStyle = { padding: '8px', borderRadius: '8px', border: '1px solid #ddd', width: '80px', textAlign: 'center' };
const startBtn = { padding: '12px 30px', fontSize: '20px', borderRadius: '12px', border: 'none', background: '#52c41a', color: 'white', fontWeight: 'bold', cursor: 'pointer', width: '100%' };
const roleBtn = { padding: '15px 25px', fontSize: '18px', borderRadius: '12px', border: 'none', background: '#1890ff', color: 'white', cursor: 'pointer' };

const gameScreenStyle = { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#000', color: '#fff' };
const topBar = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 40px', background: '#111' };
const infoText = { fontSize: '24px', fontWeight: '900' };
const confirmBtn = { padding: '8px 16px', background: '#52c41a', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 'bold', cursor: 'pointer' };

const mainContent = { display: 'flex', flex: 1, overflow: 'hidden' };
const sideColumn = { width: '15%', padding: '15px', background: '#0a0a0a', display: 'flex', flexDirection: 'column', borderRight: '1px solid #1a1a1a', borderLeft: '1px solid #1a1a1a' };
const centerColumn = { width: '70%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000', position: 'relative', padding: '0 20px' };

const mainTermWrapper = { width: '100%', textAlign: 'center', overflow: 'hidden' };
const mainTermStyle = (text) => ({
  // 根據字數動態調整字體大小，字越多越小
  fontSize: text.length > 6 ? 'min(8vw, 100px)' : 'min(12vw, 160px)',
  whiteSpace: 'nowrap',
  fontWeight: '900',
  textShadow: '0 0 20px rgba(24,144,255,0.4)',
  margin: 0
});

const listScroll = { flex: 1, overflowY: 'auto' };
const listItemGreen = { fontSize: '20px', padding: '10px', margin: '5px 0', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'rgba(82,196,26,0.1)', color: '#b7eb8f', textAlign: 'left' };
const listItemRed = { fontSize: '20px', padding: '10px', margin: '5px 0', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'rgba(255,77,79,0.1)', color: '#ffa39e', textAlign: 'left' };

const layoutStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', textAlign: 'center' };
const controlBtn = { padding: '30px', fontSize: '32px', border: 'none', borderRadius: '20px', color: '#fff', fontWeight: 'bold', cursor: 'pointer' };