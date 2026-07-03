# Mission Control Dashboard

A premium, interactive Mission Control dashboard for entrepreneurs tracking business challenges. Fully integrated with Supabase DB, Stripe success logging, GoHighLevel opportunities progression, Kixie outbound dials streams, and real-time subscription channels.

## Tech Stack
- Frontend: HTML5, CSS3, ES Modules, Vite
- Backend: Supabase (Auth, PostgreSQL, Realtime, Edge Functions)

## Getting Started

### 1. Installation
Clone the repository, navigate to the folder, and install dependencies:
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory (based on `.env.example`):
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Local Development
Start the local Vite dev server:
```bash
npm run dev
```

### 4. Build for Production
Bundle assets for production hosting (Vercel, Netlify, GitHub Pages):
```bash
npm run build
```

## Features
- **Live Real-time updates**: Synchronizes automatically with Supabase tables without browser refresh.
- **Outbound Calls and DMs Tracking**: Progresses SVG subway transit network lines based on sales leads progression.
- **Interactive Developer Control Panel**: Hit `Ctrl + Shift + D` in the browser to trigger outbound call/DM dials simulation, follow-ups increments, sale logging, or daily metric resets.
