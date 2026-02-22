/**
 * TrailSDK - TRAIL Game Pro 3.2
 * 全ゲーム共通クライアントライブラリ
 */

(function (global) {
  'use strict';

  const BASE_URL = 'https://trail-game-pro-3-2.onrender.com';

  let _config = {
    gameId:    null,
    tenantId:  null,
    studentId: null,
    token:     null,
  };

  let _sessionId    = null;
  let _sessionStart = null;
  let _onAltEarned  = null;

  async function request(method, path, body, retry = 2) {
    const headers = { 'Content-Type': 'application/json' };
    if (_config.token) headers['Authorization'] = `Bearer ${_config.token}`;

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    for (let attempt = 0; attempt <= retry; attempt++) {
      try {
        const res = await fetch(BASE_URL + path, options);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new TrailSDKError(err.error || 'APIエラー', res.status);
        }
        return await res.json();
      } catch (err) {
        if (attempt === retry) throw err;
        await sleep(500 * (attempt + 1));
      }
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  class TrailSDKError extends Error {
    constructor(message, status) {
      super(message);
      this.name   = 'TrailSDKError';
      this.status = status;
    }
  }

  const Storage = {
    set(key, value) {
      try { localStorage.setItem('trail_' + key, JSON.stringify(value)); } catch {}
    },
    get(key) {
      try { return JSON.parse(localStorage.getItem('trail_' + key)); } catch { return null; }
    },
    remove(key) {
      try { localStorage.removeItem('trail_' + key); } catch {}
    },
  };

  const TrailSDK = {

    init(config = {}) {
      const saved = Storage.get('auth') || {};
      _config = {
        gameId:    config.gameId    ?? null,
        tenantId:  config.tenantId  ?? null,
        studentId: config.studentId ?? saved.studentId ?? null,
        token:     config.token     ?? saved.token     ?? null,
      };
      console.log(`[TrailSDK] init: gameId=${_config.gameId}`);
      return this;
    },

    async startSession() {
      if (!_config.studentId) { console.warn('[TrailSDK] 未ログイン'); return null; }
      try {
        const data = await request('POST', '/api/play-sessions/start', {
          tenant_id:  _config.tenantId,
          student_id: _config.studentId,
          game_id:    _config.gameId,
        });
        _sessionId    = data.session_id;
        _sessionStart = Date.now();
        console.log(`[TrailSDK] startSession: ${_sessionId}`);
        return { sessionId: _sessionId };
      } catch(e) {
        console.warn('[TrailSDK] startSession失敗:', e.message);
        return null;
      }
    },

    async endSession({ score, accuracy, correctCount, totalCount, metadata } = {}) {
      if (!_sessionId) { console.warn('[TrailSDK] セッション未開始'); return null; }
      try {
        const result = await request('PATCH', `/api/play-sessions/${_sessionId}/end`, {
          score:         score        ?? null,
          correct_count: correctCount ?? null,
          total_count:   totalCount   ?? null,
          metadata:      metadata     ?? null,
        });
        console.log(`[TrailSDK] endSession: ALT=${result.alt?.total ?? 0}`);
        if (result.alt?.awards?.length > 0 && typeof _onAltEarned === 'function') {
          _onAltEarned(result.alt);
        }
        _sessionId    = null;
        _sessionStart = null;
        return result;
      } catch(e) {
        console.warn('[TrailSDK] endSession失敗:', e.message);
        return null;
      }
    },

    showAltPopup(alt) {
      const total = typeof alt === 'number' ? alt : alt?.total ?? 0;
      if (total <= 0) return;
      const el = document.createElement('div');
      el.textContent = `+${total} ALT 🪙`;
      el.style.cssText = `
        position:fixed; top:20px; left:50%; transform:translateX(-50%);
        background:#ff9800; color:#fff; font-size:1.4rem; font-weight:bold;
        padding:12px 28px; border-radius:20px; z-index:9999;
        box-shadow:0 4px 16px rgba(0,0,0,0.3);
        animation: altSlideIn 0.4s ease;
      `;
      const style = document.createElement('style');
      style.textContent = `@keyframes altSlideIn {
        from { top: -60px; opacity:0; } to { top: 20px; opacity:1; }
      }`;
      document.head.appendChild(style);
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    },

    onAltEarned(callback) {
      _onAltEarned = callback;
      return this;
    },

    isLoggedIn() {
      return !!(_config.token && _config.studentId);
    },

    getElapsedSeconds() {
      if (!_sessionStart) return 0;
      return Math.floor((Date.now() - _sessionStart) / 1000);
    },

    Error: TrailSDKError,
  };

  global.TrailSDK = TrailSDK;

})(typeof window !== 'undefined' ? window : global);
