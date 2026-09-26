# Unifesto V3 - Frontend Application

Modern, responsive event management platform built with Next.js 16 and Supabase.

## 🚀 Features

- ✅ **Authentication System**
  - Email/Password authentication
  - Google OAuth
  - Password reset
  - Email verification
  - Secure session management

- ✅ **Event Management**
  - Browse events
  - Event details
  - Organization pages
  - Event registration

- ✅ **User Features**
  - User profiles
  - Event history
  - Organization membership

- ✅ **Modern UI/UX**
  - Responsive design
  - Dark theme
  - Smooth animations
  - Loading states
  - Error handling

## 📋 Prerequisites

- Node.js 20+ installed
- npm or yarn
- Supabase account (for authentication)

## 🛠️ Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Authentication

Follow the [QUICKSTART.md](./QUICKSTART.md) guide to set up Supabase authentication in 5 minutes.

**TL;DR:**
1. Create Supabase project
2. Copy `.env.local.example` to `.env.local`
3. Add your Supabase credentials
4. Run `npm run dev`

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
v3/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── auth/                 # Authentication pages
│   │   ├── events/               # Event pages
│   │   ├── profile/              # User profile
│   │   ├── org/                  # Organization pages
│   │   └── ...                   # Other pages
│   ├── components/               # Reusable components
│   │   ├── ui/                   # UI components
│   │   └── ...                   # Feature components
│   └── lib/                      # Utilities
│       ├── supabase/             # Supabase clients
│       ├── styles.ts             # Style utilities
│       └── utils.ts              # Helper functions
├── public/                       # Static assets
├── middleware.ts                 # Next.js middleware
├── .env.local                    # Environment variables (create this)
└── package.json
```

## 🔐 Authentication

### Setup

See [QUICKSTART.md](./QUICKSTART.md) for quick setup or [AUTH_SETUP.md](./AUTH_SETUP.md) for detailed documentation.

### Usage

```typescript
// Get current user (client)
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
const { data: { user } } = await supabase.auth.getUser();

// Get current user (server)
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

// Sign out
await supabase.auth.signOut();
```

## 🎨 Styling

- **Framework:** Tailwind CSS 4
- **Components:** Custom UI components
- **Theme:** Dark mode with brand gradient
- **Animations:** Framer Motion

## 📦 Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **Authentication:** Supabase Auth
- **Database:** Supabase (PostgreSQL)
- **Animations:** Framer Motion
- **Icons:** Lucide React

## 🚀 Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
   ```
4. Deploy

### Other Platforms

Works with any platform that supports Next.js:
- Netlify
- Railway
- AWS Amplify
- Self-hosted

## 📝 Available Scripts

```bash
# Development
npm run dev          # Start dev server with Turbopack

# Production
npm run build        # Build for production
npm run start        # Start production server

# Code Quality
npm run lint         # Run ESLint
```

## 🔧 Environment Variables

Create `.env.local` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

See `.env.local.example` for template.

## 📖 Documentation

- [QUICKSTART.md](./QUICKSTART.md) - Get started in 5 minutes
- [AUTH_SETUP.md](./AUTH_SETUP.md) - Complete authentication guide
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - What was built

## 🐛 Troubleshooting

### Build Fails

**Error:** "Missing Supabase environment variables"

**Solution:** Create `.env.local` file with your Supabase credentials.

### Authentication Not Working

**Error:** "Invalid API key"

**Solution:** 
1. Check `.env.local` exists
2. Verify credentials are correct
3. Restart dev server

### Session Not Persisting

**Solution:**
1. Clear browser cookies
2. Check `middleware.ts` is in root directory
3. Restart dev server

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is private and proprietary.

## 🆘 Support

For issues or questions:
- Check documentation files
- Review [Supabase docs](https://supabase.com/docs)
- Review [Next.js docs](https://nextjs.org/docs)

---

**Built with ❤️ using Next.js and Supabase**
