VECTOR ARCADE
==============

日本語
------
Vector Arcade は GitHub Pages 上で動作するレトロ風バーチャルアーケードです。
現在はデモ版のため **決済機能は停止中** です。

### 主な特徴
- ブラウザだけで動作する静的アプリ
- 6つのゲームを内蔵（MARINEO, CITYSHOOTER, HEX FRONTLINE, ORB FALL, DUEL RONDE, **BLOOD CRYPT**）
- キーボード（左右キー）で筐体選択、Enter/Space でプレイ開始
- デモ版は **コイン不要でプレイ可能**（7分タイマー表示あり）

### ローカル実行
```bash
# リポジトリルートで以下のいずれかを実行
npx serve .
# または
python3 -m http.server 8000
```
ブラウザで `http://localhost:8000` (または表示されたURL) を開きます。

### BLOOD CRYPT（Phaser 3）
Diablo 1風ダンジョンクローラー。Phaser 3エンジンで構築され、タイルマップ、ライティング、パーティクルエフェクトを搭載。
- **エンジン**: Phaser 3.80.1 (CDN)
- **操作**: WASD/矢印で移動、SPACEで近接攻撃、Qでファイアボール、Eで回復、Pでポーズ、Rでリスタート
- **目標**: 3フロアを探索し、デーモンロードを倒す（約3〜7分）
- **特徴**: 手続き生成ダンジョン、松明照明、ミニマップ、アニメーションスプライト

### 公開方法（GitHub Pages）
以下のファイル/フォルダをそのままリポジトリに置いて公開します。
- `index.html`
- `tokusho.html` / `tokusho-en.html`
- `marineo/`, `wireframe_cityshooter/`, `hex_frontline/`, `vector_orb_fall/`, `vector_duel_ronde/`, `vector_crypt/`

### 注意
- 決済は停止中のため、BUY COINS は案内表示のみです。
- 法的表記ページは `tokusho.html` と `tokusho-en.html` を参照してください。


English
-------
Vector Arcade is a retro-style virtual arcade running on GitHub Pages.
Payments are wired through the Cloudflare Worker in `worker/`.

### Features
- Static web app that runs fully in the browser
- Includes 6 built-in games (MARINEO, CITYSHOOTER, HEX FRONTLINE, ORB FALL, DUEL RONDE, **BLOOD CRYPT**)
- Use Left/Right arrows to select a cabinet, Enter/Space to start
- Demo mode allows free play (with a 7-minute timer display)

### Running Locally
```bash
# From repository root, run one of:
npx serve .
# or
python3 -m http.server 8000
```
Then open `http://localhost:8000` (or the displayed URL) in your browser.

### BLOOD CRYPT (Phaser 3)
Diablo 1-inspired dungeon crawler. Built with Phaser 3 engine featuring tilemap, lighting, and particle effects.
- **Engine**: Phaser 3.80.1 (CDN)
- **Controls**: WASD/Arrows to move, SPACE for melee, Q for fireball, E to heal, P to pause, R to restart
- **Goal**: Explore 3 floors and defeat the Demon Lord (~3–7 minute run)
- **Features**: Procedural dungeon generation, torch lighting, minimap, animated sprites

### Publishing (GitHub Pages)
Upload these files/folders in your repository:
- `index.html`
- `tokusho.html` / `tokusho-en.html`
- `marineo/`, `wireframe_cityshooter/`, `hex_frontline/`, `vector_orb_fall/`, `vector_duel_ronde/`, `vector_crypt/`

### Notes
- BUY COINS creates a Stripe Checkout Session through the Worker, then redeems paid sessions for coins after redirect.
- Legal notices are available in `tokusho.html` and `tokusho-en.html`.
