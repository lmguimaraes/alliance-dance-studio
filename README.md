# Alliance Dance Studio

Professional website for Alliance Dance Studio - Montreal's premier Latin dance studio.

## Features

- 🌍 **Multi-language Support** - English, Spanish, and French
- 📅 **Studio Booking System** - Real-time availability and booking management
- 🎨 **Modern Design** - Elegant black, gold, and burgundy theme
- 📱 **Fully Responsive** - Mobile-first design
- 👨‍💼 **Admin Dashboard** - Manage bookings and studio availability
- 🔐 **Authentication** - Secure login with Manus OAuth

## Tech Stack

- **Frontend**: React 19 + Tailwind CSS 4
- **Backend**: Node.js + Express
- **Database**: MySQL/TiDB (via Drizzle ORM)
- **API**: tRPC for type-safe API calls
- **i18n**: react-i18next for multi-language support
- **UI Components**: shadcn/ui + Radix UI

## Project Structure

```
alliance-dance-studio/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── i18n/          # Translation files
│   │   └── lib/           # Utilities and configurations
│   └── public/            # Static assets
├── server/                # Node.js backend
│   ├── routers.ts         # tRPC API routes
│   ├── db.ts              # Database queries
│   └── _core/             # Core server functionality
├── drizzle/               # Database schema and migrations
│   └── schema.ts          # Database tables definition
└── shared/                # Shared types and constants
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm
- MySQL/TiDB database

### Installation

1. Clone the repository:
```bash
git clone https://github.com/lmguimaraes/alliance-dance-studio.git
cd alliance-dance-studio
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials and other settings
```

4. Run database migrations:
```bash
pnpm db:push
```

5. Seed the database (optional):
```bash
npx tsx seed-db.ts
```

6. Start the development server:
```bash
pnpm dev
```

The application will be available at `http://localhost:3000`

## Database Schema

### Studios
- Studio information (name, description, hourly rate, images)
- Active/inactive status

### Bookings
- User information (name, email, phone)
- Booking details (date, time, duration)
- Status (pending, confirmed, cancelled)
- Special requests

### Time Slots
- Available time slots per studio
- Day of week and time ranges
- Availability status

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm db:push` - Push database schema changes
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier

## Pages

- **Home** - Hero section, studio overview, and call-to-action
- **About** - Studio history, mission, and team
- **Classes** - Available dance classes with schedules
- **Studio Rental** - Interactive booking system with calendar
- **Gallery** - Photo gallery of the studio and events
- **Contact** - Contact form and information
- **Admin** - Dashboard for managing bookings (admin only)

## Multi-language Support

The website supports three languages:
- English (default)
- Spanish
- French

Language preference is stored in localStorage and persists across sessions.

## Admin Access

To access the admin dashboard:
1. Navigate to `/admin`
2. Log in with your Manus account
3. Your account must have admin role in the database

## Deployment

This project is designed to be deployed on the Manus platform, which provides:
- Automatic SSL certificates
- Database hosting
- OAuth authentication
- File storage (S3)
- Analytics

For deployment instructions, refer to the Manus documentation.

## License

© 2025 Alliance Dance Studio. All rights reserved.

## Support

For questions or support, contact: info@alliancedance.com
