import React, { useState } from 'react';

const GyroTest = () => {
  const [status, setStatus] = useState('等待授權...');
  const [orientation, setOrientation] = useState({ alpha: 0, beta: 0, gamma: 0 });

  const requestPermission = () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
            setStatus('授權成功');
          } else {
            setStatus('授權被拒絕');
          }
        })
        .catch(console.error);
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
      setStatus('監聽中 (非 iOS)');
    }
  };

  const handleOrientation = (event) => {
    setOrientation({
      alpha: event.alpha?.toFixed(0),
      beta: event.beta?.toFixed(0),
      gamma: event.gamma?.toFixed(0)
    });
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#f9f9f9', borderRadius: '10px', marginTop: '20px' }}>
      <h3>2. 手機感應器測試</h3>
      <p>狀態：{status}</p>
      <button onClick={requestPermission} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
        啟動感應器授權
      </button>
      
      <div style={{ marginTop: '20px' }}>
        <p style={{ fontSize: '24px' }}>Beta (前後傾斜): <span style={{ color: 'red', fontWeight: 'bold' }}>{orientation.beta}</span></p>
        <div style={{ fontSize: '14px', color: '#666', textAlign: 'left', display: 'inline-block' }}>
          <p>測試指南：</p>
          <ol>
            {/* 這裡使用了字串包起來，就不會報錯了 */}
            <li>{"點頭 (螢幕朝地) -> 數值會變大 (例如 > 45)"}</li>
            <li>{"仰頭 (螢幕朝天) -> 數值會變小 (例如 < -45)"}</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default GyroTest;