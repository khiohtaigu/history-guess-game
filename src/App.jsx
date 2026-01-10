import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { db } from './firebaseConfig';
import { ref, set, onValue, update, get } from "firebase/database";

const ROOM_ID = "ROOM_001"; 

export default function App() {
  const [view, setView] = useState('HOME'); 
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

  const resetToHome = async () => {
    if (window.confirm("確定要重置並回到首頁嗎？")) {
      await update(ref(db, `rooms/${ROOM_ID}`), {
        state: 'SETTINGS', subject: null, category: null,
        usedIds: [], roundScores: [], currentRound: 1
      });
      setView('HOME');
    }
  };

  const renderContent = () => {
    if (view === 'ADMIN') return <AdminView onBack={() => setView('HOME')} />;
    
    if (view === 'HOME') return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <h1 style={mainTitleStyle}>你講我臆</h1>
          <button style={startBtn} onClick={() => setView('SUBJECT')}>進入遊戲 ➔</button>
        </div>
        <button style={adminEntryBtn} onClick={() => setView('ADMIN')}>⚙️ 題庫匯入</button>
      </div>
    );

    if (view === 'SUBJECT') return (
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

    if (view === 'ROLE') return (
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

    if (view === 'PROJECTOR') return <ProjectorView roomData={roomData} resetSystem={resetToHome} />;
    if (view === 'PLAYER') return <PlayerView roomDataRef={roomDataRef} />;
  };

  return <div style={{fontFamily: '"Microsoft JhengHei", sans-serif'}}>{renderContent()}</div>;
}

// --- 1. 管理後台 (修正解析邏輯) ---
function AdminView({ onBack }) {
  const [loading, setLoading] = useState(false);
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet);
      
      const formatted = json.map(i => ({
        id: i['序號'] || Math.random(),
        term: i['名詞'] || '',
        book: String(i['分冊'] || ''), // 強制轉字串
        category: String(i['章節'] || ''),
        keywords: i['關鍵字'] || ''
      }));

      if (window.confirm(`讀取到 ${formatted.length} 筆題目，確定匯入嗎？`)) {
        setLoading(true);
        set(ref(db, 'question_pool'), formatted).then(() => {
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
        <h2>管理後台：匯入題庫</h2>
        <p>請選擇包含「名詞、分冊、章節」欄位的 Excel</p>
        <input type="file" accept=".xlsx" onChange={handleFileUpload} style={{margin: '20px 0'}} />
        <br/>
        <button style={backLink} onClick={onBack}>← 返回首頁</button>
      </div>
    </div>
  );
}

// --- 2. 投影幕組件 (修正篩選邏輯) ---
function ProjectorView({ roomData, resetSystem }) {
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
    if (!snapshot.exists()) return alert("資料庫是空的！請先點擊首頁左下角⚙️匯入。");
    const pool = Object.values(snapshot.val());
    
    // 修正後的篩選邏輯：同時比對 book 與 category，且包含字串判斷
    let filtered = roomData.category === '全範圍' 
      ? pool 
      : pool.filter(q => (q.book && q.book.includes(roomData.category)) || (q.category && q.category.includes(roomData.category)));
    
    if (!roomData.allowDuplicate) {
      filtered = filtered.filter(q => !(roomData.usedIds || []).includes(q.id));
    }

    if (filtered.length === 0) return alert(`範圍「${roomData.category}」題目已用完或找不到匹配題目！`);
    const shuffled = filtered.sort(() => Math.random() - 0.5);

    await update(ref(db, `rooms/${ROOM_ID}`), {
      state: 'PLAYING', queue: shuffled, currentIndex: 0, score: 0, history: [], timeLeft: roomData.timePerRound
    });
  };

  const toggleItem = async (idx) => {
    const newH = [...roomData.history];
    newH[idx].type = newH[idx].type === '正確' ? '跳過' : '正確';
    await update(ref(db, `rooms/${ROOM_ID}`), { history: newH, score: newH.filter(h => h.type === '正確').length });
  };

  if (!roomData || roomData.state === 'SETTINGS') {
    return (
      <div style={lobbyContainer}>
        <div style={glassCard}>
          <h2 style={subTitle}>初始設定 ({roomData?.category})</h2>
          <div style={settingRow}><span>總回合數</span><input type="number" style={inputStyle} value={tempSettings.rounds} onChange={e=>setTempSettings({...tempSettings, rounds: parseInt(e.target.value)})} /></div>
          <div style={settingRow}><span>每輪秒數</span><input type="number" style={inputStyle} value={tempSettings.time} onChange={e=>setTempSettings({...tempSettings, time: parseInt(e.target.value)})} /></div>
          <label style={{display: 'block', margin: '20px 0'}}><input type="checkbox" checked={tempSettings.dup} onChange={e=>setTempSettings({...tempSettings, dup: e.target.checked})} /> 允許題目重複</label>
          <button style={startBtn} onClick={() => update(ref(db, `rooms/${ROOM_ID}`), { state: 'LOBBY', totalRounds: tempSettings.rounds, timePerRound: tempSettings.time, allowDuplicate: tempSettings.dup })}>儲存設定</button>
          <button style={backLink} onClick={resetSystem}>取消回首頁</button>
        </div>
      </div>
    );
  }

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
          <button style={backLink} onClick={resetSystem}>重置回首頁</button>
        </div>
      </div>
    );
  }

  const currentQ = roomData.queue?.[roomData.currentIndex];
  const isReview = roomData.state === 'REVIEW';

  return (
    <div style={gameScreenStyle}>
      <div style={topBar}>
        <div style={infoText}>{roomData.category} | RD {roomData.currentRound}</div>
        <div style={{...infoText, color: roomData.timeLeft <= 10 ? 'red' : 'white'}}>⏳ {roomData.timeLeft}s</div>
        <div style={{...infoText, color: '#ffec3d'}}>SCORE: {roomData.score}</div>
        {isReview && <button style={confirmBtn} onClick={async () => {
          const newScores = [...(roomData.roundScores || []), { round: roomData.currentRound, score: roomData.score }];
          const newUsedIds = [...(roomData.usedIds || []), ...roomData.queue.slice(0, roomData.currentIndex).map(q => q.id)];
          await update(ref(db, `rooms/${ROOM_ID}`), { state: roomData.currentRound >= roomData.totalRounds ? 'TOTAL_END' : 'ROUND_END', roundScores: newScores, usedIds: newUsedIds });
        }}>確認結算 ➔</button>}
        <button style={resetSmallBtn} onClick={resetSystem}>RESET</button>
      </div>
      <div style={mainContent}>
        <div style={sideColumn}>
          <h3 style={{color: '#52c41a', borderBottom: '1px solid #52c41a'}}>正確</h3>
          <div style={listScroll}>
            {[...(roomData.history || [])].map((h, i) => h.type === '正確' && (
              <div key={i} style={listItemGreen} onClick={() => toggleItem(i)}>{h.q}</div>
            )).reverse()}
          </div>
        </div>
        <div style={centerColumn}>
          <div style={{fontSize: '32px', color: '#666'}}>{currentQ?.category}</div>
          <h1 style={mainTermStyle(currentQ?.term || "")}>{currentQ?.term}</h1>
          {isReview && <div style={{color: '#ffec3d', fontSize: '24px', marginTop: '20px'}}>點擊兩側清單可修正</div>}
        </div>
        <div style={sideColumn}>
          <h3 style={{color: '#ff4d4f', borderBottom: '1px solid #ff4d4f'}}>跳過</h3>
          <div style={listScroll}>
            {[...(roomData.history || [])].map((h, i) => h.type === '跳過' && (
              <div key={i} style={listItemRed} onClick={() => toggleItem(i)}>{h.q}</div>
            )).reverse()}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- 3. 控制器組件 ---
function PlayerView({ roomDataRef }) {
  const submit = async (type) => {
    const data = roomDataRef.current;
    if (!data || data.state !== 'PLAYING') return;
    const nextIdx = data.currentIndex + 1;
    const currentQ = data.queue[data.currentIndex];
    const newH = [...(data.history || []), { q: currentQ.term, type: type }];
    await update(ref(db, `rooms/${ROOM_ID}`), { currentIndex: nextIdx, score: type === '正確' ? data.score + 1 : data.score, history: newH });
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

// --- 4. 樣式系統 ---
const lobbyContainer = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)', position: 'relative' };
const glassCard = { background: 'rgba(255,255,255,0.95)', padding: '50px', borderRadius: '40px', boxShadow: '0 30px 80px rgba(0,0,0,0.15)', textAlign: 'center', minWidth: '500px' };
const mainTitleStyle = { fontSize: '90px', fontWeight: '900', color: '#1890ff', marginBottom: '50px', letterSpacing: '15px', textShadow: '4px 4px 0px rgba(255,255,255,1), 8px 8px 20px rgba(0,0,0,0.1)' };
const subTitle = { fontSize: '32px', marginBottom: '40px', color: '#444', fontWeight: 'bold' };
const gridContainer = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '40px' };
const roleBtn = { padding: '25px', fontSize: '24px', borderRadius: '20px', border: 'none', background: '#fff', boxShadow: '0 6px 15px rgba(0,0,0,0.08)', cursor: 'pointer', fontWeight: 'bold', color: '#1890ff' };
const roleBtnDisabled = { ...roleBtn, background: '#eee', color: '#aaa', cursor: 'not-allowed', boxShadow: 'none' };
const startBtn = { padding: '20px 60px', fontSize: '28px', borderRadius: '25px', border: 'none', background: '#1890ff', color: '#fff', fontWeight: 'bold', cursor: 'pointer', width: '100%', boxShadow: '0 10px 20px rgba(24,144,255,0.3)' };
const backLink = { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px', marginTop: '20px' };
const adminEntryBtn = { position: 'absolute', bottom: '20px', left: '20px', background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', opacity: 0.5 };

const gameScreenStyle = { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#000', color: '#fff', overflow: 'hidden' };
const topBar = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 40px', background: '#111' };
const infoText = { fontSize: '24px', fontWeight: 'bold' };
const mainContent = { display: 'flex', flex: 1, overflow: 'hidden' };
const sideColumn = { width: '15%', padding: '15px', background: '#0a0a0a', display: 'flex', flexDirection: 'column' };
const centerColumn = { width: '70%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 40px' };
const mainTermStyle = (text) => ({ fontSize: text.length > 8 ? 'min(7vw, 90px)' : text.length > 5 ? 'min(10vw, 120px)' : 'min(14vw, 180px)', whiteSpace: 'nowrap', fontWeight: '900', textShadow: '0 0 30px rgba(24,144,255,0.5)', margin: 0 });
const listScroll = { flex: 1, overflowY: 'auto' };
const listItemGreen = { fontSize: '20px', padding: '10px', margin: '5px 0', borderRadius: '8px', cursor: 'pointer', backgroundColor: 'rgba(82,196,26,0.1)', color: '#b7eb8f', textAlign: 'left' };
const listItemRed = { fontSize: '20px', padding: '10px', margin: '5px 0', borderRadius: '8px', cursor: 'pointer', backgroundColor: 'rgba(255,77,79,0.1)', color: '#ffa39e', textAlign: 'left' };
const resetSmallBtn = { padding: '5px 10px', background: '#333', border: 'none', color: '#666', borderRadius: '4px', cursor: 'pointer' };
const confirmBtn = { padding: '10px 20px', background: '#52c41a', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 'bold', cursor: 'pointer' };
const settingRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '15px 0', fontSize: '20px' };
const inputStyle = { padding: '10px', borderRadius: '10px', border: '1px solid #ddd', width: '100px', textAlign: 'center' };
const layoutStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', textAlign: 'center' };
const controlBtn = { padding: '40px', fontSize: '36px', border: 'none', borderRadius: '25px', color: '#fff', fontWeight: 'bold', cursor: 'pointer' };