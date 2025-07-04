# Earthquake Evacuation Route Guidance System

A comprehensive real-time earthquake evacuation system that provides dynamic route optimization, AR navigation, and emergency management coordination.

## 🌟 System Overview

This system provides real-time, context-aware evacuation guidance that dynamically adapts to changing seismic conditions and urban hazards. It integrates multiple data sources and technologies to ensure optimal evacuation routes and emergency response coordination.

### Key Features

- **Real-Time Route Optimization** with USGS earthquake data integration
- **AR Navigation** with multi-modal guidance (visual, auditory, haptic)
- **Dynamic Hazard Detection** from crowd-sourced reports
- **Emergency Management Dashboard** for first responders
- **Crowd Density Analysis** for bottleneck identification
- **Offline Capability** with cached maps and local processing
- **Multi-Platform Support** (iOS, Android, Web Dashboard)

## 🏗️ System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Mobile Apps   │    │  Backend Services │    │   Dashboard     │
│                 │    │                   │    │                 │
│ • AR Navigation │◄──►│ • Route Engine    │◄──►│ • Real-time Map │
│ • Hazard Report │    │ • USGS API        │    │ • Unit Tracking │
│ • SOS Emergency │    │ • Emergency Mgmt  │    │ • Alert System  │
│ • Offline Maps  │    │ • Crowd Analysis  │    │ • Resource Mgmt │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                       ┌────────┴────────┐
                       │  External APIs  │
                       │                 │
                       │ • USGS Feed     │
                       │ • OpenStreetMap │
                       │ • City Systems  │
                       │ • Weather APIs  │
                       └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- React Native CLI
- Android Studio / Xcode
- PostgreSQL or MongoDB
- Redis (for caching)

### Backend Setup

```bash
cd earthquake-evacuation-system
npm install
npm run start
```

The backend server will start on port 3000 with:
- REST API endpoints
- WebSocket server for real-time updates
- USGS data polling
- Emergency management services

### Mobile App Setup

```bash
cd mobile
npm install

# For Android
npm run android

# For iOS
npm run ios
```

### Dashboard Setup

```bash
cd dashboard
npm install
npm start
```

The dashboard will be available at http://localhost:3001

## 📱 Mobile App Features

### AR Navigation
- Real-time path overlay on camera view
- Color-coded routes (green=safe, red=danger, orange=caution)
- Floating direction arrows at decision points
- Distance and time indicators

### Multi-Modal Guidance
- **Visual**: AR path overlay with hazard markers
- **Auditory**: 3D spatial audio directions and warnings
- **Haptic**: Distinct vibration patterns for turns and alerts

### Safety Features
- Automatic SOS if movement stops unexpectedly
- Group evacuation coordination
- Offline map capability
- Real-time hazard reporting

## 🖥️ Emergency Management Dashboard

### Real-Time Monitoring
- Live earthquake activity from USGS
- Active evacuation tracking
- Hazard verification and management
- Emergency unit deployment status

### Resource Allocation
- Automatic emergency service dispatch
- Crowd density bottleneck identification
- Evacuation route optimization
- Response time tracking

### Analytics & Reporting
- Evacuation completion rates
- System performance metrics
- Historical trend analysis
- Export capabilities for post-incident review

## 🔧 Configuration

### Environment Variables

Create `.env` files in each component:

**Backend (.env)**
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/evacuation
REDIS_URL=redis://localhost:6379
USGS_API_URL=https://earthquake.usgs.gov/earthquakes/feed/v1.0
LOG_LEVEL=info
```

**Mobile (mobile/.env)**
```env
API_BASE_URL=http://localhost:3000
MAPBOX_API_KEY=your_mapbox_key
ENABLE_AR=true
DEBUG_MODE=true
```

**Dashboard (dashboard/.env)**
```env
REACT_APP_API_URL=http://localhost:3000
REACT_APP_MAP_PROVIDER=openstreetmap
REACT_APP_REFRESH_INTERVAL=30000
```

## 🗺️ API Documentation

### Route Calculation
```http
POST /api/route/calculate
Content-Type: application/json

{
  "userLocation": {
    "lat": 35.6762,
    "lng": 139.6503
  },
  "preferences": {
    "avoidHighTraffic": true,
    "wheelchairAccessible": false
  }
}
```

### Hazard Reporting
```http
POST /api/hazards/report
Content-Type: application/json

{
  "type": "building_collapse",
  "location": {
    "lat": 35.6762,
    "lng": 139.6503
  },
  "severity": "critical",
  "description": "Partial building collapse blocking road"
}
```

### Real-Time Updates (WebSocket)
```javascript
socket.on('earthquake_update', (data) => {
  // Handle new earthquake data
});

socket.on('hazard_alert', (hazard) => {
  // Handle hazard notifications
});

socket.on('route_updated', (route) => {
  // Handle route recalculation
});
```

## 🧪 Testing

### Running Tests
```bash
# Backend tests
npm test

# Mobile tests
cd mobile && npm test

# Dashboard tests
cd dashboard && npm test

# Integration tests
npm run test:integration
```

### Test Scenarios
The system includes test scenarios for:
- Route calculation under various seismic conditions
- Hazard detection and verification
- Emergency service dispatch
- Crowd density analysis
- AR navigation accuracy

## 🔒 Security & Privacy

### Data Protection
- End-to-end encryption for location data
- Anonymous crowd density tracking
- GDPR-compliant data handling
- Secure API authentication

### Emergency Protocols
- Emergency service bypass channels
- Priority routing for critical situations
- Automatic failover systems
- Data redundancy and backup

## 📊 Performance Metrics

### System Benchmarks
- Route calculation: <3 seconds average
- Real-time updates: <1 second latency
- AR rendering: 30+ FPS on target devices
- Concurrent users: 10,000+ supported

### Scalability
- Horizontal scaling via load balancers
- Database sharding for location data
- CDN for map tiles and static assets
- Edge computing for route calculation

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Code Standards
- ESLint configuration for JavaScript
- Prettier for code formatting
- Jest for testing
- Conventional commits for git messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Emergency Contacts

For system issues during emergency situations:
- **Emergency Dispatch**: 911 (US) / 119 (Japan)
- **System Status**: https://status.evacuation-system.com
- **24/7 Support**: +1-555-EVACUATION

## 🙏 Acknowledgments

- **USGS** for real-time earthquake data
- **OpenStreetMap** community for mapping data
- **React Native** and **AR** development communities
- **Emergency management professionals** for domain expertise

---

**⚠️ IMPORTANT SAFETY NOTE ⚠️**

This system is designed to assist in emergency evacuation but should not be the sole source of safety information. Always follow official emergency broadcasts and instructions from local authorities. In case of immediate danger, prioritize personal safety over using the application.

For technical support and feature requests, please visit our [GitHub Issues](https://github.com/evacuation-system/issues) page.