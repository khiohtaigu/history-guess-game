import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebaseConfig';
import { ref, set, onValue, update, get } from "firebase/database";

const ROOM_ID = "ROOM_001"; 

export default function App() {
  const [view, setView] = useState('HOME'); // HOME, SUBJECT, CATEGORY, ROLE, GAME
  const [roomData, setRoomData] = useState(null);
  const roomDataRef = useRef(null);

  // 1. 全域監聽 Firebase 狀態
  useEffect(() => {
    const roomRef = ref(db, `rooms/${ROOM_ID}`);
    return onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      setRoomData(data);
      roomDataRef.current = data;
      
      // 如果 Firebase 被重置，強制回到首頁 (除了設定視圖時)
      if (!data || data.state === 'SETTINGS') {
        // 這裡不強制跳轉，交由各畫面邏輯判斷
      }
    });
  }, []);

  // 2. 輔助函數：重置整個系統回到最一開始
  const resetToHome = async () => {
    if (window.confirm("確定要重置並回到首頁嗎？")) {
      await set(ref(db, `rooms/${ROOM_ID}`), {
        state: 'SETTINGS',
        subject: null,
        category: null,
        totalRounds: 3,
        timePerRound: 180,
        allowDuplicate: false,
        usedIds: [],
        roundScores: [],
        currentRound: 1
      });
      setView('HOME');
    }
  };

  // 3. 渲染邏輯
  const renderContent = () => {
    // A. 首頁
    if (view === 'HOME') {
      return (
        <div style={lobbyContainer}>
          <div style={glassCard}>
            <h1 style={{fontSize: '80px', fontWeight: '900', color: '#1890ff', marginBottom: '40px', letterSpacing: '10px'}}>你講我臆</h1>
            <button style={startBtn} onClick={() => setView('SUBJECT')}>開始點按 ➔</button>
          </div>
        </div>
      );
    }

    // B. 選擇科目
    if (view === 'SUBJECT') {
      return (
        <div style={lobbyContainer}>
          <div style={glassCard}>
            <h2 style={subTitle}>選擇科目</h2>
            <div style={gridContainer}>
              <button style={roleBtn} onClick={() => setView('CATEGORY')}>📜 歷史</button>
              <button style={roleBtnDisabled} disabled>🌍 地理 (建置中)</button>
              <button style={roleBtnDisabled} disabled>⚖️ 公民 (建置中)</button>
            </div>
            <button style={backLink} onClick={() => setView('HOME')}>← 返回</button>
          </div>
        </div>
      );
    }

    // C. 選擇範圍 (歷史)
    if (view === 'CATEGORY') {
      const categories = ["台灣史", "東亞史", "世界史", "選修上", "選修下", "全範圍"];
      return (
        <div style={lobbyContainer}>
          <div style={glassCard}>
            <h2 style={subTitle}>選擇範圍</h2>
            <div style={gridContainer}>
              {categories.map(cat => (
                <button key={cat} style={roleBtn} onClick={async () => {
                  await update(ref(db, `rooms/${ROOM_ID}`), { subject: '歷史', category: cat });
                  setView('ROLE');
                }}>{cat}</button>
              ))}
            </div>
            <button style={backLink} onClick={() => setView('SUBJECT')}>← 返回</button>
          </div>
        </div>
      );
    }

    // D. 選擇角色
    if (view === 'ROLE') {
      return (
        <div style={lobbyContainer}>
          <div style={glassCard}>
            <h2 style={subTitle}>{roomData?.category} - 選擇身分</h2>
            <div style={{display: 'flex', gap: '20px', justifyContent: 'center'}}>
              <button style={roleBtn} onClick={() => setView('PROJECTOR')}>💻 投影幕端</button>
              <button style={roleBtn} onClick={() => setView('PLAYER')}>📱 控制器端</button>
            </div>
            <button style={backLink} onClick={() => setView('CATEGORY')}>← 返回</button>
          </div>
        </div>
      );
    }

    // E. 進入實際遊戲邏輯
    if (view === 'PROJECTOR') return <ProjectorView roomData={roomData} resetSystem={resetToHome} />;
    if (view === 'PLAYER') return <PlayerView roomDataRef={roomDataRef} />;
  };

  return <div style={{fontFamily: '"Microsoft JhengHei", sans-serif'}}>{renderContent()}</div>;
}

// --- 投影幕組件 ---
function ProjectorView({ roomData, resetSystem }) {
  const [tempSettings, setTempSettings] = useState({ rounds: 3, time: 180, dup: false });

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

  const startRound = async () => {
    const snapshot = await get(ref(db, 'question_pool'));
    if (!snapshot.exists()) return alert("請先匯入題庫！");
    const pool = Object.values(snapshot.val());
    
    // 篩選符合分類的題目
    let filtered = roomData.category === '全範圍' 
      ? pool 
      : pool.filter(q => q.category === roomData.category || q.book === roomData.category);
    
    // 過濾已使用
    if (!roomData.allowDuplicate) {
      filtered = filtered.filter(q => !(roomData.usedIds || []).includes(q.id));
    }

    if (filtered.length === 0) return alert("該範圍題目已用完！");
    const shuffled = filtered.sort(() => Math.random() - 0.5);

    await update(ref(db, `rooms/${ROOM_ID}`), {
      state: 'PLAYING', queue: shuffled, currentIndex: 0, score: 0, history: [], timeLeft: roomData.timePerRound
    });
  };

  const toggleHistoryItem = async (idx) => {
    const newHistory = [...roomData.history];
    newHistory[idx].type = newHistory[idx].type === '正確' ? '跳過' : '正確';
    const newScore = newHistory.filter(h => h.type === '正確').length;
    await update(ref(db, `rooms/${ROOM_ID}`), { history: newHistory, score: newScore });
  };

  if (!roomData || roomData.state === 'SETTINGS') {
    return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <h2 style={subTitle}>遊戲初始設定 ({roomData?.category})</h2>
          <div style={settingRow}><span>總回合數</span><input type="number" style={inputStyle} value={tempSettings.rounds} onChange={e=>setTempSettings({...tempSettings, rounds: parseInt(e.target.value)})} /></div>
          <div style={settingRow}><span>每輪秒數</span><input type="number" style={inputStyle} value={tempSettings.time} onChange={e=>setTempSettings({...tempSettings, time: parseInt(e.target.value)})} /></div>
          <label style={{display: 'block', margin: '20px 0'}}><input type="checkbox" checked={tempSettings.dup} onChange={e=>setTempSettings({...tempSettings, dup: e.target.checked})} /> 允許題目重複</label>
          <button style={startBtn} onClick={() => update(ref(db, `rooms/${ROOM_ID}`), { state: 'LOBBY', totalRounds: tempSettings.rounds, timePerRound: tempSettings.time, allowDuplicate: tempSettings.dup })}>儲存設定</button>
        </div>
      </div>
    );
  }

  // 休息區與結算區
  if (roomData.state === 'LOBBY' || roomData.state === 'ROUND_END' || roomData.state === 'TOTAL_END') {
    if (roomData.state === 'TOTAL_END') {
      const total = (roomData.roundScores || []).reduce((a, b) => a + b.score, 0);
      return (
        <div style={lobbyContainer}>
          <div style={glassCard}>
            <h1 style={{fontSize: '48px'}}>🏆 總成績</h1>
            {roomData.roundScores?.map((r, i) => <div key={i} style={{fontSize: '24px'}}>第 {r.round} 輪：{r.score} 分</div>)}
            <h2 style={{fontSize: '64px', color: '#1890ff', marginTop: '20px'}}>總分：{total}</h2>
            <button style={startBtn} onClick={resetSystem}>回首頁</button>
          </div>
        </div>
      );
    }
    return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <h1>{roomData.state === 'ROUND_END' ? `第 ${roomData.currentRound} 輪結束` : "準備就緒"}</h1>
          <h2 style={{margin: '30px 0', color: '#1890ff', fontSize: '48px'}}>第 {roomData.state === 'ROUND_END' ? roomData.currentRound + 1 : roomData.currentRound} 輪</h2>
          <button style={startBtn} onClick={async () => {
            if(roomData.state === 'ROUND_END') await update(ref(db, `rooms/${ROOM_ID}`), { currentRound: roomData.currentRound + 1 });
            startRound();
          }}>開始挑戰</button>
          <button style={{...startBtn, background: '#888', marginTop: '15px'}} onClick={resetSystem}>重置回首頁</button>
        </div>
      </div>
    );
  }

  // 遊戲進行中
  const currentQ = roomData.queue?.[roomData.currentIndex];
  const isReview = roomData.state === 'REVIEW';

  return (
    <div style={gameScreenStyle}>
      <div style={topBar}>
        <div style={infoText}>{roomData.category} | 第 {roomData.currentRound} 輪</div>
        <div style={{...infoText, color: roomData.timeLeft <= 10 ? 'red' : 'white'}}>⏳ {roomData.timeLeft}s</div>
        <div style={{...infoText, color: '#ffec3d'}}>SCORE: {roomData.score}</div>
        {isReview && <button style={confirmBtn} onClick={async () => {
          const roundScore = { round: roomData.currentRound, score: roomData.score };
          const newRoundScores = [...(roomData.roundScores || []), roundScore];
          const newUsedIds = [...(roomData.usedIds || []), ...roomData.queue.slice(0, roomData.currentIndex).map(q => q.id)];
          await update(ref(db, `rooms/${ROOM_ID}`), { state: roomData.currentRound >= roomData.totalRounds ? 'TOTAL_END' : 'ROUND_END', roundScores: newRoundScores, usedIds: newUsedIds });
        }}>確認結算 ➔</button>}
        <button style={resetSmallBtn} onClick={resetSystem}>RESET</button>
      </div>
      <div style={mainContent}>
        <div style={sideColumn}>
          <h3 style={{color: '#52c41a', borderBottom: '2px solid #52c41a'}}>正確</h3>
          <div style={listScroll}>
            {[...(roomData.history || [])].map((h, i) => h.type === '正確' && (
              <div key={i} style={listItemGreen} onClick={() => toggleHistoryItem(i)}>{h.q}</div>
            )).reverse()}
          </div>
        </div>
        <div style={centerColumn}>
          <div style={{fontSize: '32px', color: '#666'}}>{currentQ?.category}</div>
          <h1 style={mainTermStyle(currentQ?.term || "")}>{currentQ?.term}</h1>
          {isReview && <div style={{color: '#ffec3d', fontSize: '28px', marginTop: '20px'}}>請核對清單並點選修正</div>}
        </div>
        <div style={sideColumn}>
          <h3 style={{color: '#ff4d4f', borderBottom: '2px solid #ff4d4f'}}>跳過</h3>
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
  const submit = async (type) => {
    const data = roomDataRef.current;
    if (!data || data.state !== 'PLAYING') return;
    const nextIdx = data.currentIndex + 1;
    const currentQ = data.queue[data.currentIndex];
    const newHistory = [...(data.history || []), { q: currentQ.term, type: type }];
    await update(ref(db, `rooms/${ROOM_ID}`), { currentIndex: nextIdx, score: type === '正確' ? data.score + 1 : data.score, history: newHistory });
  };
  const data = roomDataRef.current;
  if (!data || data.state !== 'PLAYING') return <div style={layoutStyle}><h2>⏳ 等待開始...</h2><p>範圍：{data?.category}</p></div>;
  return (
    <div style={{ ...layoutStyle, backgroundColor: '#1890ff', color: '#fff' }}>
      <h2 style={{fontSize: '48px', marginBottom: '50px'}}>{data.queue?.[data.currentIndex]?.term}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '85%' }}>
        <button style={{ ...controlBtn, backgroundColor: '#52c41a' }} onClick={() => submit('正確')}>正確</button>
        <button style={{ ...controlBtn, backgroundColor: '#ff4d4f' }} onClick={() => submit('跳過')}>跳過</button>
      </div>
    </div>
  );
}

// --- 樣式設定 ---
const lobbyContainer = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)' };
const glassCard = { background: 'rgba(255,255,255,0.9)', padding: '50px', borderRadius: '32px', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', textAlign: 'center', minWidth: '450px' };
const subTitle = { fontSize: '28px', marginBottom: '30px', color: '#555' };
const gridContainer = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '30px' };
const roleBtn = { padding: '20px', fontSize: '20px', borderRadius: '16px', border: 'none', background: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', cursor: 'pointer', transition: '0.3s', fontWeight: 'bold', color: '#1890ff' };
const roleBtnDisabled = { ...roleBtn, background: '#eee', color: '#aaa', cursor: 'not-allowed' };
const backLink = { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px' };
const startBtn = { padding: '18px 50px', fontSize: '24px', borderRadius: '18px', border: 'none', background: '#1890ff', color: '#fff', fontWeight: 'bold', cursor: 'pointer', width: '100%' };
const settingRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '15px 0', fontSize: '18px' };
const inputStyle = { padding: '10px', borderRadius: '10px', border: '1px solid #ddd', width: '100px', textAlign: 'center' };

const gameScreenStyle = { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#000', color: '#fff' };
const topBar = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 40px', background: '#111' };
const infoText = { fontSize: '22px', fontWeight: 'bold' };
const mainContent = { display: 'flex', flex: 1, overflow: 'hidden' };
const sideColumn = { width: '15%', padding: '15px', background: '#0a0a0a', display: 'flex', flexDirection: 'column' };
const centerColumn = { width: '70%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 40px' };
const mainTermStyle = (text) => ({ fontSize: text.length > 8 ? 'min(7vw, 90px)' : text.length > 5 ? 'min(10vw, 120px)' : 'min(14vw, 180px)', whiteSpace: 'nowrap', fontWeight: '900', textShadow: '0 0 30px rgba(24,144,255,0.5)', margin: 0 });
const listScroll = { flex: 1, overflowY: 'auto' };
const listItemGreen = { fontSize: '20px', padding: '10px', margin: '5px 0', borderRadius: '8px', cursor: 'pointer', backgroundColor: 'rgba(82,196,26,0.1)', color: '#b7eb8f', textAlign: 'left' };
const listItemRed = { fontSize: '20px', padding: '10px', margin: '5px 0', borderRadius: '8px', cursor: 'pointer', backgroundColor: 'rgba(255,77,79,0.1)', color: '#ffa39e', textAlign: 'left' };
const resetSmallBtn = { padding: '5px 10px', background: '#333', border: 'none', color: '#666', borderRadius: '4px', cursor: 'pointer' };
const confirmBtn = { padding: '10px 20px', background: '#52c41a', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 'bold', cursor: 'pointer' };
const layoutStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', textAlign: 'center' };
const controlBtn = { padding: '40px', fontSize: '36px', border: 'none', borderRadius: '25px', color: '#fff', fontWeight: 'bold', cursor: 'pointer' };