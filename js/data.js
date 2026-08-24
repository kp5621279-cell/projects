/**
 * ZR Web Desktop Clone - Music Catalog & Metadata
 * Includes Global Top Hits, Bollywood, Pop, Lo-Fi, Synthwave, Electronic, and Synced Lyrics.
 */

export const INITIAL_ARTISTS = [
  {
    id: "art-1",
    name: "The Weeknd",
    monthlyListeners: "108,452,190",
    verified: true,
    avatar: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600&auto=format&fit=crop&q=80",
    bio: "Abél Makkonen Tesfaye, known professionally as The Weeknd, is a Canadian singer-songwriter and record producer noted for his sonic versatility and dark lyricism.",
    color: "#842029"
  },
  {
    id: "art-2",
    name: "Arijit Singh",
    monthlyListeners: "94,320,110",
    verified: true,
    avatar: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1600&auto=format&fit=crop&q=80",
    bio: "Arijit Singh is an Indian playback singer and music composer. The recipient of several accolades including a National Film Award and seven Filmfare Awards.",
    color: "#d84000"
  },
  {
    id: "art-3",
    name: "Dua Lipa",
    monthlyListeners: "78,321,900",
    verified: true,
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1600&auto=format&fit=crop&q=80",
    bio: "English and Albanian singer-songwriter known for her signature disco-pop and dance-pop records.",
    color: "#9933ff"
  },
  {
    id: "art-4",
    name: "Diljit Dosanjh",
    monthlyListeners: "32,870,410",
    verified: true,
    avatar: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1600&auto=format&fit=crop&q=80",
    bio: "Diljit Dosanjh is an Indian singer, songwriter, actor, film producer and television personality who works in Punjabi and Hindi cinema.",
    color: "#ba5d07"
  },
  {
    id: "art-5",
    name: "Synthwave Sunset",
    monthlyListeners: "24,870,410",
    verified: true,
    avatar: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80",
    bio: "Electronic music project crafting nostalgic 80s synthwave, retrowave rhythms, and neon-lit highway anthems.",
    color: "#ff007f"
  },
  {
    id: "art-6",
    name: "Lofi Beats Collective",
    monthlyListeners: "42,150,000",
    verified: true,
    avatar: "https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=600&auto=format&fit=crop&q=80",
    banner: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=1600&auto=format&fit=crop&q=80",
    bio: "Cozy chillhop, study beats, warm vinyl crackles, and ambient late-night melodies to focus and relax.",
    color: "#e67e22"
  }
];

export const INITIAL_TRACKS = [
  {
    id: "track-1",
    title: "Blinding Lights",
    artist: "The Weeknd",
    artistId: "art-1",
    album: "After Hours",
    duration: 200,
    plays: "3,892,104,219",
    cover: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
    color: "#b30000",
    genre: "Pop / Synthwave",
    youtubeId: "4NRXx6U8ABQ",
    audioSrc: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=electronic-future-beats-117997.mp3",
    lyrics: [
      { time: 0, text: "(Intro - Synth Arpeggios & 80s Drums)" },
      { time: 10, text: "I've been on my own for long enough" },
      { time: 15, text: "Maybe you can show me how to love, maybe" },
      { time: 21, text: "I'm going through withdrawals" },
      { time: 26, text: "You don't even have to do too much" },
      { time: 30, text: "You can turn me on with just a touch, baby" },
      { time: 36, text: "I look around and Sin City's cold and empty" },
      { time: 42, text: "No one's around to judge me" },
      { time: 47, text: "I can't see clearly when you're gone" },
      { time: 52, text: "I said, ooh, I'm blinded by the lights" },
      { time: 58, text: "No, I can't sleep until I feel your touch" },
      { time: 64, text: "I said, ooh, I'm drowning in the night" },
      { time: 70, text: "Oh, when I'm like this, you're the one I trust" }
    ]
  },
  {
    id: "track-2",
    title: "Kesariya",
    artist: "Arijit Singh",
    artistId: "art-2",
    album: "Brahmāstra",
    duration: 268,
    plays: "1,420,980,500",
    cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    color: "#e65100",
    genre: "Bollywood / Romantic",
    youtubeId: "BddP6PYo2gs",
    audioSrc: "https://cdn.pixabay.com/download/audio/2021/08/04/audio_bb630cc098.mp3?filename=acoustic-guitars-ambient-uplifting-11264.mp3",
    lyrics: [
      { time: 0, text: "Mujhko itna bataye koi... kaise tujhse dil na lagaye koi" },
      { time: 15, text: "Rabba ne tujhko banane mein, kar di hai husn ki khaali tijoriyan" },
      { time: 32, text: "Kajal ki siyahi se likhi, hai tune jaane kitno ki love storiyan" },
      { time: 48, text: "Kesariya tera ishq hai piya, rang jaaun jo main haath lagaun" },
      { time: 65, text: "Din beete saara teri fikr mein, rain saari teri khair manaun" }
    ]
  },
  {
    id: "track-3",
    title: "Levitating",
    artist: "Dua Lipa",
    artistId: "art-3",
    album: "Future Nostalgia",
    duration: 203,
    plays: "2,410,551,320",
    cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    color: "#6b2c91",
    genre: "Disco Pop",
    youtubeId: "TUVcZfQe-Kw",
    audioSrc: "https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f792cb.mp3?filename=tuesday-glitch-122709.mp3",
    lyrics: [
      { time: 0, text: "If you wanna run away with me, I know a galaxy" },
      { time: 6, text: "And I can take you for a ride" },
      { time: 11, text: "I had a premonition that we fell into a rhythm" },
      { time: 16, text: "Where the music don't stop for life" },
      { time: 22, text: "Glitter in the sky, glitter in our eyes" },
      { time: 43, text: "You want me, I want you, baby" },
      { time: 48, text: "My sugarboo, I'm levitating!" }
    ]
  },
  {
    id: "track-4",
    title: "Lover",
    artist: "Diljit Dosanjh",
    artistId: "art-4",
    album: "MoonChild Era",
    duration: 195,
    plays: "650,210,000",
    cover: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&auto=format&fit=crop&q=80",
    color: "#ba5d07",
    genre: "Punjabi / Pop",
    youtubeId: "mH_LFkWxpI0",
    audioSrc: "https://cdn.pixabay.com/download/audio/2022/01/26/audio_d0c6ff1101.mp3?filename=energy-sport-10645.mp3",
    lyrics: [
      { time: 0, text: "Tera ni mai lover, tera ni mai lover" },
      { time: 14, text: "Koyi aake dekh le ki mere dil vich ki ae" },
      { time: 28, text: "Ankhiyan ch bas tuhi tu disdi ae" },
      { time: 42, text: "Tera ni mai lover!" }
    ]
  },
  {
    id: "track-5",
    title: "Apna Bana Le",
    artist: "Arijit Singh",
    artistId: "art-2",
    album: "Bhediya",
    duration: 261,
    plays: "980,450,200",
    cover: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80",
    color: "#004d40",
    genre: "Bollywood",
    youtubeId: "ElZfdU54Cp8",
    audioSrc: "https://cdn.pixabay.com/download/audio/2021/08/04/audio_bb630cc098.mp3?filename=acoustic-guitars-ambient-uplifting-11264.mp3",
    lyrics: [
      { time: 0, text: "Tu mera koi na hoke bhi kuch laage" },
      { time: 16, text: "Kiya re jo bhi tune kaise kiya re, jiya ko mere baandh aise liya re" },
      { time: 35, text: "Apna bana le piya, apna bana le piya" },
      { time: 52, text: "Dil ke nagar mein shehar tu basa le piya" }
    ]
  },
  {
    id: "track-6",
    title: "Starboy",
    artist: "The Weeknd",
    artistId: "art-1",
    album: "Starboy",
    duration: 230,
    plays: "3,120,998,000",
    cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
    color: "#c62828",
    genre: "R&B / Pop",
    youtubeId: "34Na4j8AVgA",
    audioSrc: "https://cdn.pixabay.com/download/audio/2022/11/06/audio_c93e43d61f.mp3?filename=electronic-rock-king-around-here-15045.mp3",
    lyrics: [
      { time: 0, text: "Look what you've done..." },
      { time: 8, text: "I'm a starboy, shining bright in the dark" },
      { time: 20, text: "Every day a new milestone, every night a spark" }
    ]
  },
  {
    id: "track-7",
    title: "Resonance (Synthwave)",
    artist: "Synthwave Sunset",
    artistId: "art-5",
    album: "Cyberpunk 1984",
    duration: 212,
    plays: "142,390,110",
    cover: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80",
    color: "#d81b60",
    genre: "Synthwave",
    youtubeId: "8GW6sLrK40k",
    audioSrc: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=synthwave-80s-110045.mp3",
    lyrics: [
      { time: 0, text: "(Cruising down the coastal highway under purple skies)" },
      { time: 25, text: "Fast lanes, neon signs, never looking back" }
    ]
  },
  {
    id: "track-8",
    title: "Lofi Girl Chill Beats",
    artist: "Lofi Beats Collective",
    artistId: "art-6",
    album: "Chilled Afternoon",
    duration: 164,
    plays: "654,120,890",
    cover: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&auto=format&fit=crop&q=80",
    color: "#8d6e63",
    genre: "Lo-Fi",
    youtubeId: "jfKfPfyJRdk",
    audioSrc: "https://cdn.pixabay.com/download/audio/2022/05/16/audio_db6591201e.mp3?filename=lofi-study-112191.mp3",
    lyrics: [
      { time: 0, text: "(Gentle vinyl crackle and soothing rain)" },
      { time: 20, text: "Peaceful focus & endless chill vibes" }
    ]
  }
];

export const INITIAL_PLAYLISTS = [
  {
    id: "playlist-today-top",
    title: "Today's Top Hits",
    description: "The biggest global hits right now on ZR & YouTube.",
    curator: "ZR",
    cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    color: "#1e3264",
    trackIds: ["track-1", "track-2", "track-3", "track-4", "track-5", "track-6"]
  },
  {
    id: "playlist-bollywood-hits",
    title: "Bollywood Romantic",
    description: "Soulful tracks by Arijit Singh and top Indian artists.",
    curator: "ZR",
    cover: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80",
    color: "#e65100",
    trackIds: ["track-2", "track-5", "track-4"]
  },
  {
    id: "playlist-lofi-focus",
    title: "Chill & Focus Lofi",
    description: "Peaceful beats, warm vinyl crackles, and relaxing melodies for work and study.",
    curator: "ZR",
    cover: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&auto=format&fit=crop&q=80",
    color: "#ba5d07",
    trackIds: ["track-8", "track-7"]
  }
];

export const CATEGORIES = [
  { id: "cat-english", title: "English", color: "#8d67ab", icon: "🇬🇧" },
  { id: "cat-hindi", title: "Hindi", color: "#e65100", icon: "🇮🇳" },
  { id: "cat-bollywood", title: "Bollywood", color: "#d84000", icon: "🎬" },
  { id: "cat-punjabi", title: "Punjabi / Tollywood", color: "#ba5d07", icon: "🕺" },
  { id: "cat-tamil", title: "Tamil", color: "#ff7a59", icon: "🎭" },
  { id: "cat-hollywood", title: "Hollywood", color: "#4a90e2", icon: "🎥" },
  { id: "cat-18plus", title: "18+", color: "#b30000", icon: "🔞" },
  { id: "cat-pop", title: "Pop", color: "#e91429", icon: "🎤" },
  { id: "cat-hiphop", title: "Hip-Hop", color: "#bc5900", icon: "🎧" },
  { id: "cat-chill", title: "Chill & Lo-Fi", color: "#27ae60", icon: "☕" }
];
