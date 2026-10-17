(function () {
  const localTracks = () => app.tracks.filter(track => track.kind === 'local' || track.kind === 'android');
  const nativeAndroid = () => Boolean(window.Capacitor?.isNativePlatform?.() && /android/i.test(navigator.userAgent));
  const trackPageSize = 60;
  const moods = [
    ['all', 'All'],
    ['energise', 'Energise'],
    ['relax', 'Relax'],
    ['feel-good', 'Feel Good'],
    ['party', 'Party'],
    ['focus', 'Focus']
  ];
  const moodTerms = {
    energise: ['dance', 'energy', 'upbeat', 'rock', 'electro'],
    relax: ['ambient', 'calm', 'chill', 'relax', 'acoustic', 'classical', 'jazz'],
    'feel-good': ['happy', 'feel good', 'soul', 'pop'],
    party: ['party', 'dance', 'edm', 'electronic', 'disco'],
    focus: ['focus', 'instrumental', 'classical', 'ambient', 'study']
  };

  app.tracks = localTracks();
  app.visibleTrackLimit = app.visibleTrackLimit || trackPageSize;
  app.queue = app.queue.filter(id => id.startsWith('android:') || app.tracks.some(track => track.id === id));
  app.cloudSongs = [];
  app.homeMood = 'all';
  if (nativeAndroid()) {
    document.getElementById('volume-slider').setAttribute('aria-label', 'Phone media volume');
  }
  // v2 is deliberately a single black-and-red identity; it no longer follows a
  // light/system theme that would dilute the liquid-glass material.
  app.theme = 'tuxie';
  document.body.dataset.theme = 'tuxie';

  artwork = function (track, size = 'small', extra = '') {
    const image = track.artworkUrl
      ? `<img class="cover-image" src="${esc(track.artworkUrl)}" alt="" loading="lazy" decoding="async">`
      : track.artworkUri
        ? `<i class="orb"></i><i class="ring"></i><i class="art-line"></i><i class="art-spark"></i><img class="cover-image" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" data-native-artwork="${esc(track.artworkUri)}" alt="">`
        : '<i class="orb"></i><i class="ring"></i><i class="art-line"></i><i class="art-spark"></i>';
    return `<span class="artwork ${esc(track.tone || 'demo')} ${size} ${extra}" aria-label="${esc(track.album || track.title)} cover art">${image}</span>`;
  };

  const originalPlayTrack = playTrack;
  playTrack = async function (track, preserveQueue = false) {
    if (!track) {
      notify('Choose or import a song from this device to start listening.');
      return;
    }
    if (track.kind === 'android') return playNativeTrack(track, preserveQueue);
    if (track.kind !== 'local') {
      notify('Tuxie Music Player is set up for music selected from this device.');
      return;
    }
    return originalPlayTrack(track, preserveQueue);
  };

  const originalSelectMusicFolder = selectMusicFolder;
  selectMusicFolder = function () {
    if (nativeAndroid()) return requestAndroidMusicAccess();
    return originalSelectMusicFolder();
  };

  const originalRestorePlaybackState = restorePlaybackState;
  restorePlaybackState = function () {
    originalRestorePlaybackState();
    app.queue = app.queue.filter(id => id.startsWith('android:') || localTracks().some(track => track.id === id));
    app.recent = app.recent.filter(id => localTracks().some(track => track.id === id));
    if (!['local', 'android'].includes(app.current?.kind)) app.current = null;
    if (app.pendingPlaybackTrackId && !app.pendingPlaybackTrackId.startsWith('android:') && !getTrack(app.pendingPlaybackTrackId)) app.pendingPlaybackTrackId = null;
    renderQueue();
    renderMini();
    hydrateNativeArtwork(document);
  };

  trackRows = function (tracks) {
    if (!tracks.length) {
      return `<div class="empty-state">${app.native.enabled ? (app.native.permissionRequired ? 'Allow music access to scan shared audio files. Tuxie uses this permission only to list and play music on your device.' : 'Scan audio files available on this device. Tuxie reads music metadata and plays selected tracks locally.') : 'Your device library is empty. Import audio you have permission to play.'}<div class="empty-actions">${app.native.enabled ? `<button class="hero-play" data-action="scan-device-library">${app.native.permissionRequired ? 'Allow music access and scan' : 'Scan device music'}</button>${app.native.permissionRequired ? '<button class="secondary-button" data-action="open-app-settings">Open Android app settings</button>' : ''}` : ''}<button class="secondary-button" data-action="import">Choose audio files</button></div></div>`;
    }
    const visible = tracks.slice(0, app.visibleTrackLimit);
    return `<div class="track-list">${visible.map((track, index) => `<div class="track-row" data-track="${esc(track.id)}"><span class="track-index">${String(index + 1).padStart(2, '0')}</span>${artwork(track)}<div class="track-info"><strong>${esc(track.title)}</strong><small>${esc(track.artist)}</small></div><span class="track-album">${esc(track.album || 'On this device')}</span><span class="track-duration">${fmt(track.duration)}</span><button class="more-button" data-queue="${esc(track.id)}" aria-label="Add ${esc(track.title)} to queue">＋</button><button class="heart-button ${app.favorites.has(track.id) ? 'favorited' : ''}" data-favorite="${esc(track.id)}" aria-label="${app.favorites.has(track.id) ? 'Remove from' : 'Add to'} favourites">${app.favorites.has(track.id) ? '♥' : '♡'}</button></div>`).join('')}</div>${tracks.length > visible.length ? `<button class="secondary-button list-more virtual-sentinel" data-action="show-more-tracks" data-virtual-more aria-label="Load the next ${Math.min(trackPageSize, tracks.length - visible.length)} songs">Loading more songs as you scroll…</button>` : ''}`;
  };

  renderSearch = function () {
    const query = app.search.trim().toLowerCase();
    const found = query ? localTracks().filter(track => track.kind === 'local' && `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(query)) : [];
    return `<h1>Find your music.</h1><p class="page-subtitle">Search songs, artists, and albums in your local library.</p><label class="search-box"><span aria-hidden="true">⌕</span><input id="search-input" value="${esc(app.search)}" placeholder="Search songs or artists" autocomplete="off" aria-label="Search songs and artists"></label><div id="search-results">${query ? `<div class="section-heading"><h2>${found.length} ${found.length === 1 ? 'song' : 'songs'}</h2></div>${trackRows(found)}` : '<div class="empty-state">Search songs from this device. Your music is not uploaded.</div>'}</div>`;
  };

  function paintSearchResults(query, androidTracks = [], totalMatches = null, hasMore = false) {
    const target = document.getElementById('search-results');
    if (!target || app.page !== 'search') return;
    const local = localTracks().filter(track => track.kind === 'local'
      && `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(query.toLowerCase()));
    const merged = new Map([...local, ...androidTracks].map(track => [track.id, track]));
    const tracks = [...merged.values()];
    const count = totalMatches === null ? tracks.length : totalMatches + local.length;
    target.innerHTML = tracks.length
      ? `<div class="section-heading"><h2>${count} ${count === 1 ? 'song' : 'songs'} found</h2></div>${trackRows(tracks)}${hasMore ? '<button class="secondary-button list-more" data-action="load-more-search">Load more matching songs</button>' : ''}`
      : '<div class="empty-state">No matching tracks found on this device.</div>';
  }

  function deviceLibraryMoreButton() {
    if (!nativeAndroid()) return '';
    if (app.native.scanning) return `<p class="settings-hint library-scan-status" role="status"><span data-scan-message>Scanning your music… ${app.tracks.filter(track => track.kind === 'android').length}${app.native.totalCount ? ` of ${app.native.totalCount}` : ''} songs found.</span><button class="text-link scan-cancel" data-action="cancel-device-library-scan" type="button">Cancel</button></p>`;
    return '';
  }

  function deviceLibraryStatus() {
    if (!nativeAndroid()) return '';
    if (app.native.scanning) return `<p class="settings-hint library-scan-status" role="status"><span data-scan-message>Scanning your music… ${app.tracks.filter(track => track.kind === 'android').length}${app.native.totalCount ? ` of ${app.native.totalCount}` : ''} songs found.</span><button class="text-link scan-cancel" data-action="cancel-device-library-scan" type="button">Cancel</button></p>`;
    if (!app.native.totalCount) return '';
    const loaded = app.tracks.filter(track => track.kind === 'android').length;
    return `<p class="settings-hint library-scan-status" role="status">${loaded} songs indexed from this device.</p>`;
  }

  window.refreshTuxieSearch = async function () {
    const query = app.search.trim();
    const token = ++app.native.searchToken;
    app.native.searchTracks = [];
    app.native.searchOffset = 0;
    app.native.searchTotal = 0;
    app.native.searchHasMore = false;
    if (!query) {
      const target = document.getElementById('search-results');
      if (target) target.innerHTML = '<div class="empty-state">Search songs from this device. Your music is not uploaded.</div>';
      return;
    }
    if (!nativeAndroid()) {
      paintSearchResults(query);
      return;
    }
    const target = document.getElementById('search-results');
    if (target) target.innerHTML = '<div class="empty-state">Searching music on this device…</div>';
    try {
      const result = await nativePlaybackCall('searchLibrary', { query, offset: 0, limit: 100 });
      if (token !== app.native.searchToken || query !== app.search.trim()) return;
      app.native.searchTracks = (result.tracks || []).map(track => ({ ...track, tone: 'demo' }));
      app.native.searchOffset = Number(result.nextOffset) || 0;
      app.native.searchTotal = Number(result.totalCount) || 0;
      app.native.searchHasMore = result.hasMore === true;
      const indexed = new Map(app.tracks.map(track => [track.id, track]));
      app.native.searchTracks.forEach(track => indexed.set(track.id, track));
      app.tracks = [...indexed.values()];
      paintSearchResults(query, app.native.searchTracks, app.native.searchTotal, app.native.searchHasMore);
      hydrateNativeArtwork(document.getElementById('search-results'));
    } catch (error) {
      console.error('Android library search failed.', error);
      if (token === app.native.searchToken) {
        const result = document.getElementById('search-results');
        if (result) result.innerHTML = `<div class="empty-state">Search could not read this device’s library. Check music access in Settings and try again.</div>`;
        notify(error.message || 'Android could not search the music library.');
      }
    }
  };

  window.loadMoreTuxieSearch = async function () {
    if (!nativeAndroid() || !app.native.searchHasMore) return;
    const query = app.search.trim();
    const token = app.native.searchToken;
    try {
      const result = await nativePlaybackCall('searchLibrary', { query, offset: app.native.searchOffset, limit: 100 });
      if (token !== app.native.searchToken || query !== app.search.trim()) return;
      const more = (result.tracks || []).map(track => ({ ...track, tone: 'demo' }));
      const indexed = new Map(app.tracks.map(track => [track.id, track]));
      more.forEach(track => indexed.set(track.id, track));
      app.tracks = [...indexed.values()];
      app.native.searchTracks = [...app.native.searchTracks, ...more];
      app.native.searchOffset = Number(result.nextOffset) || app.native.searchOffset;
      app.native.searchTotal = Number(result.totalCount) || app.native.searchTotal;
      app.native.searchHasMore = result.hasMore === true;
      paintSearchResults(query, app.native.searchTracks, app.native.searchTotal, app.native.searchHasMore);
      hydrateNativeArtwork(document.getElementById('search-results'));
    } catch (error) {
      console.error('Could not load more Android search results.', error);
      notify(error.message || 'More matching Android tracks could not be loaded.');
    }
  };

  renderLibrary = function () {
    const tracks = localTracks();
    const favourites = tracks.filter(track => app.favorites.has(track.id));
    const count = nativeAndroid() ? `${tracks.length} loaded` : tracks.length;
    return `<h1>Your library.</h1><p class="page-subtitle">Your music, available offline on this device.</p><div class="section-heading"><h2>Favourites · ${favourites.length}</h2></div>${favourites.length ? trackRows(favourites) : '<p class="settings-hint">Favourite a song to save it here.</p>'}<div class="section-heading"><h2>All songs · ${count}</h2><button data-action="import">＋ Add music</button></div>${deviceLibraryStatus()}${trackRows(tracks)}<div class="section-heading"><h2>Playlists</h2><button data-action="create-playlist">＋ Create playlist</button></div>${app.playlists.length ? app.playlists.map(playlist => `<div class="queue-item" data-playlist="${esc(playlist.id)}">${artwork({ tone: 'rose', title: playlist.name }, 'small')}<div class="queue-info"><strong>${esc(playlist.name)}</strong><small>${playlist.tracks.length} ${playlist.tracks.length === 1 ? 'song' : 'songs'}</small></div></div>`).join('') : '<div class="empty-state">Create a playlist to collect your favourite local songs.</div>'}`;
  };

  renderHome = function () {
    const tracks = localTracks();
    const recent = app.recent.map(getTrack).filter(track => track && ['local', 'android'].includes(track.kind)).slice(0, 8);
    const newest = tracks.slice().reverse().slice(0, 8);
    const terms = moodTerms[app.homeMood] || [];
    const moodTracks = app.homeMood === 'all' ? tracks : tracks.filter(track => {
      const metadata = `${track.title} ${track.artist} ${track.album}`.toLowerCase();
      return terms.some(term => metadata.includes(term));
    });
    const carousel = (list, variant = 'standard') => list.length
      ? `<div class="home-carousel home-carousel-${variant}">${list.map(track => variant === 'featured'
        ? `<button class="home-album-card home-feature-card" data-play="${esc(track.id)}" aria-label="Play ${esc(track.title)} by ${esc(track.artist)}">${artwork(track, 'medium')}<span class="home-card-sheen" aria-hidden="true"></span><span class="home-card-copy"><strong>${esc(track.title)}</strong><small>${esc(track.artist)}</small><span class="home-card-play" aria-hidden="true">▶</span></span></button>`
        : `<button class="home-album-card" data-play="${esc(track.id)}" aria-label="Play ${esc(track.title)} by ${esc(track.artist)}">${artwork(track, 'medium')}<strong>${esc(track.title)}</strong><small>${esc(track.artist)}</small></button>`).join('')}</div>`
      : '<div class="empty-state compact-empty">Nothing here yet. Import music from your device to see your collection.</div>';
    const loadedCount = nativeAndroid() ? `${tracks.length} loaded` : `${tracks.length}`;
    return `<div class="home-brandline"><img class="home-brand-portrait" src="./assets/branding/tuxie-avatar-512.jpg" alt=""><span>Tuxie <small>MUSIC PLAYER</small></span><button id="home-settings" aria-label="Open settings">⚙</button></div><div class="home-intro"><span class="eyebrow">YOUR MUSIC · ON THIS DEVICE</span><h1>Listen Now<span>.</span></h1><p class="page-subtitle">A little more room for the music you love.</p></div><div class="mood-filters" role="group" aria-label="Filter music by mood">${moods.map(([id, label]) => `<button class="${app.homeMood === id ? 'selected' : ''}" data-mood="${id}" aria-pressed="${app.homeMood === id}">${label}</button>`).join('')}</div><section class="home-section home-section-featured"><div class="section-heading"><h2>Recently Played</h2><button data-page="recent">See all</button></div>${carousel(recent, 'featured')}</section><section class="home-section"><div class="section-heading"><h2>Made For Your Mood</h2><span class="home-count">${moodTracks.length} ${moodTracks.length === 1 ? 'song' : 'songs'}</span></div>${carousel(moodTracks.slice(0, 6))}</section><section class="home-section"><div class="section-heading"><h2>Recently Added</h2><button data-page="library">Your library</button></div>${carousel(newest)}</section><section class="home-section"><div class="section-heading"><h2>All Songs</h2><span class="home-count">${loadedCount}</span></div>${deviceLibraryStatus()}${trackRows(tracks)}</section>`;
  };

  renderSettings = function () {
    const nativeTrack = nativeAndroid() && app.current?.kind === 'android';
    return `<h1>Your settings.</h1><p class="page-subtitle">Tune your listening space and local music library.</p><section class="settings-card"><span class="eyebrow">APPEARANCE</span><h2>Liquid Glass.</h2><p>Deep red glass is the default. Choose your preferred display theme.</p><label class="settings-control"><span>Theme</span><select id="theme-select" aria-label="Colour theme"><option value="system">Follow device</option><option value="dark">Dark</option><option value="light">Light</option></select></label></section><section class="settings-card"><span class="eyebrow">OFFLINE LIBRARY</span><h2>Your music stays yours.</h2><p>${nativeAndroid() ? 'Scan playable music from Android’s shared media library. Tuxie ignores ringtones, alarms, and incomplete downloads; scanning continues in small batches so the app stays responsive.' : 'Select MP3 files or a folder on this device. Tuxie reads supported tags and embedded cover art locally; files are not uploaded.'}</p>${nativeAndroid() ? `<button class="hero-play" data-action="scan-device-library" ${app.native.scanning ? 'disabled' : ''}>${app.native.scanning ? 'Scanning your music…' : app.native.permissionRequired ? 'Allow music access and scan' : 'Scan my music'}</button>${app.native.permissionRequired ? '<button class="secondary-button" data-action="open-app-settings">Open Android app settings</button>' : ''}` : ''}<button class="secondary-button" data-action="import">Choose audio files</button>${!nativeAndroid() ? `<button class="secondary-button" data-action="select-music-folder">Choose music folder</button>` : ''}<p class="settings-hint">${localTracks().length} songs currently indexed. Android discovery uses MediaStore; inaccessible/private app folders are not exposed.</p></section>${nativeAndroid() ? `<section class="settings-card"><span class="eyebrow">ANDROID CONTROLS</span><h2>Playback notifications.</h2><p>Audio access and notification access are separate. Tuxie asks for notification permission only if you choose to enable it.</p><button class="secondary-button" data-action="${app.native.notificationDenied ? 'open-notification-settings' : 'request-notifications'}">${app.native.notificationDenied ? 'Open notification settings' : 'Enable playback notifications'}</button><p class="settings-hint">Add the Tuxie Music Player widget from your Android home screen’s Widgets picker. Widget controls use the same Media3 player.</p></section>` : ''}<section class="settings-card"><span class="eyebrow">PLAYBACK</span><h2>${nativeAndroid() ? 'Android Media3 player' : 'Audio processing'}</h2><p>${nativeAndroid() ? 'MediaStore tracks use the Android Media3 playback service and MediaSession. Imported WebView file-picker items use foreground browser audio.' : 'The equaliser processes browser audio where Web Audio is supported.'}</p>${nativeTrack ? '<p class="settings-hint">Android Media3 does not currently expose a reliable per-app equaliser on this device. No equaliser is applied to this native track.</p>' : '<button class="secondary-button" data-equalizer>Open browser equaliser</button>'}</section>`;
  };

  function bindInfiniteSongList() {
    const sentinel = document.querySelector('[data-virtual-more]');
    if (!sentinel) return;
    app.virtualObserver?.disconnect();
    app.virtualObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || app.virtualLoading) return;
      app.virtualLoading = true;
      window.setTimeout(() => {
        app.virtualLoading = false;
        app.visibleTrackLimit = window.TuxieLibraryState.nextVisibleCount(app.visibleTrackLimit, localTracks().length, trackPageSize);
        renderPage();
      }, 80);
    }, { rootMargin: '340px 0px' });
    app.virtualObserver.observe(sentinel);
  }

  renderPage = function () {
    app.tracks = app.tracks.filter(track => track.kind === 'local' || track.kind === 'android');
    app.queue = app.queue.filter(id => id.startsWith('android:') || app.tracks.some(track => track.id === id));
    renderSidebar();
    const routes = {
      home: renderHome,
      discover: renderLibrary,
      search: renderSearch,
      library: renderLibrary,
      albums: renderAlbums,
      artists: renderArtists,
      favorites: () => `<h1>Favourites.</h1><p class="page-subtitle">Songs you have saved from your local library.</p>${trackRows(localTracks().filter(track => app.favorites.has(track.id)))}`,
      recent: () => `<h1>Recently Played.</h1><p class="page-subtitle">Your latest local listening.</p>${trackRows(app.recent.map(getTrack).filter(track => track && ['local', 'android'].includes(track.kind)))}`,
      queue: renderQueuePage,
      downloads: () => `<h1>Offline music.</h1><p class="page-subtitle">Songs imported from this device are available without a streaming service.</p>${trackRows(localTracks())}`,
      settings: renderSettings,
      about: () => `<h1>About Tuxie.</h1><p class="page-subtitle">A private, offline-first music player.</p><section class="about-brand-card"><img src="./assets/branding/tuxie-portrait-720x960.jpg" alt="Portrait used for Tuxie Music Player branding" loading="lazy" decoding="async"><div><span class="eyebrow">TUXIE MUSIC PLAYER · VERSION 2.0.0.0</span><h2>Music, close to home.</h2><p>Local by design. Device-library tracks use Android Media3 for background playback, lock-screen controls, notification controls, and the home-screen widget. Browser-picked files remain foreground-only.</p></div></section>`
    };
    pageContent.innerHTML = app.page === 'playlist-detail'
      ? renderGroupDetail()
      : app.page.startsWith('playlist-')
        ? renderPlaylist(app.page.slice(9))
        : routes[app.page] ? routes[app.page]() : renderLibrary();
    if (app.page === 'search') window.refreshTuxieSearch?.();
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = app.theme;
    document.querySelectorAll('.mobile-nav [data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === app.page));
    renderQueue();
    renderMini();
    bindInfiniteSongList();
  };

  renderMini = function () {
    const track = ['local', 'android'].includes(app.current?.kind) ? app.current : null;
    const mini = document.getElementById('mini-track');
    mini.innerHTML = track
      ? `${artwork(track)}<span class="mini-info"><strong>${esc(track.title)}</strong><small>${esc(track.artist)}</small></span>`
      : `<span class="mini-empty-art" aria-hidden="true">♫</span><span class="mini-info"><strong>Your music</strong><small>${app.tracks.length ? 'Choose a song to begin' : 'Import audio from this device'}</small></span>`;
    mini.setAttribute('aria-label', track ? `Open player for ${track.title}` : 'Open player');
    const playButton = document.getElementById('play-button');
    playButton.textContent = isCurrentTrackPlaying() ? 'Ⅱ' : '▶';
    playButton.setAttribute('aria-label', isCurrentTrackPlaying() ? 'Pause' : 'Play');
    playButton.disabled = !track && !app.tracks.length;
    document.getElementById('next-button').disabled = !track;
    document.getElementById('previous-button').disabled = !track;
    document.getElementById('player-favorite').disabled = !track;
    document.getElementById('player-favorite').textContent = track && app.favorites.has(track.id) ? '♥' : '♡';
    document.getElementById('player-favorite').classList.toggle('favorited', Boolean(track && app.favorites.has(track.id)));
    const repeatButton = document.getElementById('repeat-button');
    repeatButton.classList.toggle('selected', app.repeatMode !== 'off');
    repeatButton.textContent = app.repeatMode === 'one' ? '↻1' : '↻';
    repeatButton.setAttribute('aria-label', app.repeatMode === 'one' ? 'Repeat this song' : app.repeatMode === 'all' ? 'Repeat queue' : 'Enable repeat');
    document.getElementById('shuffle-button').classList.toggle('selected', app.shuffle);
    if (navigator.mediaSession) navigator.mediaSession.playbackState = isCurrentTrackPlaying() ? 'playing' : 'paused';
    syncProgress();
    if (!document.getElementById('now-playing').classList.contains('hidden') && track) renderNowPlaying();
    hydrateNativeArtwork(document.getElementById('mini-player'));
  };

  renderQueuePage = function () {
    const tracks = app.queue.map(getTrack).filter(Boolean);
    if (!tracks.length) return `<h1>Up next.</h1><p class="page-subtitle">Your queue stays with you while you listen.</p><div class="empty-state">Your queue is empty. Play an album or a song to get started.</div>`;
    const visible = tracks.slice(0, app.visibleTrackLimit);
    return `<h1>Up next.</h1><p class="page-subtitle">Use the arrows or drag songs to reorder your queue. The current track is not included here.</p><div class="track-list queue-track-list">${visible.map((track, index) => `<div class="track-row queue-track-row" data-queue-track="${esc(track.id)}" data-queue-item="${esc(track.id)}" draggable="true" title="Drag to reorder">${artwork(track)}<div class="track-info"><strong>${esc(track.title)}</strong><small>${esc(track.artist)}</small></div><span class="track-duration">${fmt(track.duration)}</span><span class="queue-reorder"><button type="button" data-queue-move="${esc(track.id)}" data-direction="-1" aria-label="Move ${esc(track.title)} up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-queue-move="${esc(track.id)}" data-direction="1" aria-label="Move ${esc(track.title)} down" ${index === tracks.length - 1 ? 'disabled' : ''}>↓</button></span><button class="more-button" data-remove-queue="${esc(track.id)}" aria-label="Remove ${esc(track.title)} from queue">×</button></div>`).join('')}</div>${tracks.length > visible.length ? '<button class="secondary-button list-more" data-action="show-more-tracks">Show more queued songs</button>' : ''}<div class="section-heading"><button data-action="clear-queue">Clear queue</button></div>`;
  };

  renderQueue = function () {
    const tracks = app.queue.map(getTrack).filter(track => track && track.id !== app.current?.id);
    document.getElementById('queue-count').textContent = `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`;
    const visible = tracks.slice(0, 8);
    document.getElementById('queue-list').innerHTML = tracks.length
      ? `${visible.map(track => `<div class="queue-item" data-queue-track="${esc(track.id)}">${artwork(track)}<span class="queue-info"><strong>${esc(track.title)}</strong><small>${esc(track.artist)}</small></span><span class="queue-duration">${fmt(track.duration)}</span></div>`).join('')}${tracks.length > visible.length || app.page !== 'queue' ? '<button class="text-link queue-open" data-page="queue">Open all queued songs</button>' : ''}`
      : '<div class="empty-state">Your queue is clear.</div>';
    hydrateNativeArtwork(document.getElementById('queue-list'));
  };

  renderNowPlaying = function () {
    const track = app.current;
    if (!track || !['local', 'android'].includes(track.kind)) return;
    const player = document.getElementById('now-playing');
    const playing = isCurrentTrackPlaying();
    const position = currentPlaybackPosition();
    const duration = currentPlaybackDuration() || track.duration;
    const volume = app.native.enabled ? app.native.volume : audio.volume;
    const equalizerControl = track.kind === 'android'
      ? '<button class="feature-unavailable" type="button" disabled aria-label="Equaliser unavailable for native Android tracks">Equaliser · unavailable</button>'
      : '<button data-equalizer>◒ Equaliser</button>';
    player.innerHTML = `<div class="now-backdrop-art" aria-hidden="true">${artwork(track, 'large')}</div><div class="now-drag-handle" aria-hidden="true"><span></span></div><button class="now-close" id="close-now" aria-label="Close player">×</button><div class="now-inner"><div class="now-art-frame">${artwork(track, 'large')}</div><div class="now-details"><span class="eyebrow">NOW PLAYING · ON THIS DEVICE</span><h2>${esc(track.title)}</h2><p>${esc(track.artist)} · ${esc(track.album || 'On this device')}</p><div class="timeline"><span id="now-current">${fmt(position)}</span><input id="now-seek" type="range" min="0" max="100" value="${duration ? position / duration * 100 : 0}" style="--range-progress:${duration ? position / duration * 100 : 0}%" aria-label="Seek"><span id="now-total">${fmt(duration)}</span></div><div class="transport"><button class="player-icon ${app.shuffle ? 'selected' : ''}" data-action="shuffle" aria-label="Shuffle">⤨</button><button class="player-icon" data-action="previous" aria-label="Previous track">|‹</button><button class="play-button" data-action="play" aria-label="${playing ? 'Pause' : 'Play'}">${playing ? 'Ⅱ' : '▶'}</button><button class="player-icon" data-action="next" aria-label="Next track">›|</button><button class="player-icon ${app.repeatMode !== 'off' ? 'selected' : ''}" data-action="repeat" aria-label="Repeat mode">${app.repeatMode === 'one' ? '↻1' : '↻'}</button></div><div class="now-volume"><label for="now-volume-slider">${app.native.enabled ? 'Phone media volume' : 'Volume'}</label><input id="now-volume-slider" type="range" min="0" max="1" step="0.01" value="${volume}" style="--range-progress:${volume * 100}%" aria-label="${app.native.enabled ? 'Phone media volume' : 'Volume'}"></div><div class="now-extras"><button data-favorite="${esc(track.id)}">${app.favorites.has(track.id) ? '♥ In favourites' : '♡ Add to favourites'}</button><button data-page="queue" id="open-player-queue">≡ Queue · ${app.queue.length}</button>${equalizerControl}<button data-lyrics>♫ Lyrics</button><button data-action="add-to-playlist">＋ Add to playlist</button></div></div></div>`;
    if (track.artworkUrl) player.style.setProperty('--now-art-image', `url("${track.artworkUrl}")`);
    else player.style.removeProperty('--now-art-image');
    hydrateNativeArtwork(player);
  };

  const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const originalSetPage = setPage;
  setPage = function (page) {
    if (page !== app.page) app.visibleTrackLimit = 60;
    const result = originalSetPage(page);
    if (!motionReduced) {
      const content = document.getElementById('page-content');
      content.classList.remove('page-arrive');
      void content.offsetWidth;
      content.classList.add('page-arrive');
      clearTimeout(app.pageMotionTimer);
      app.pageMotionTimer = window.setTimeout(() => content.classList.remove('page-arrive'), 420);
    }
    return result;
  };

  const player = document.getElementById('now-playing');
  const originalOpenNow = openNow;
  openNow = function () {
    if (!app.current || !['local', 'android'].includes(app.current.kind)) {
      notify('Choose a song from your library to open the player.');
      return;
    }
    clearTimeout(app.playerCloseTimer);
    player.classList.remove('player-closing');
    const result = originalOpenNow();
    if (!motionReduced) {
      player.classList.add('player-arriving');
      clearTimeout(app.playerArrivalTimer);
      app.playerArrivalTimer = window.setTimeout(() => player.classList.remove('player-arriving'), 520);
    }
    return result;
  };

  const originalCloseNow = closeNow;
  closeNow = function () {
    if (motionReduced || player.classList.contains('hidden')) return originalCloseNow();
    player.classList.remove('player-arriving');
    player.classList.add('player-closing');
    clearTimeout(app.playerCloseTimer);
    app.playerCloseTimer = window.setTimeout(() => {
      player.classList.remove('player-closing');
      originalCloseNow();
    }, 190);
  };

  const swipeRoutes = ['home', 'discover', 'library', 'search'];
  let pageTouchStart = null;
  pageContent.addEventListener('touchstart', event => {
    const target = event.target;
    if (event.touches.length !== 1 || target.closest('button,input,select,textarea,a,[role="button"],.home-carousel,.mood-filters,.track-list,.queue-list,.dialog-layer')) {
      pageTouchStart = null;
      return;
    }
    const touch = event.touches[0];
    pageTouchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  pageContent.addEventListener('touchend', event => {
    if (!pageTouchStart || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - pageTouchStart.x;
    const deltaY = touch.clientY - pageTouchStart.y;
    pageTouchStart = null;
    if (Math.abs(deltaX) < 72 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    const index = swipeRoutes.indexOf(app.page);
    const nextIndex = index + (deltaX < 0 ? 1 : -1);
    if (index >= 0 && nextIndex >= 0 && nextIndex < swipeRoutes.length) setPage(swipeRoutes[nextIndex]);
  }, { passive: true });

  let playerPointerStart = null;
  const dragSurfaceSelector = '.now-drag-handle,.now-art-frame';
  player.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.target.closest(dragSurfaceSelector)) return;
    playerPointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), height: player.clientHeight };
    event.target.setPointerCapture?.(event.pointerId);
  });
  player.addEventListener('pointermove', event => {
    if (!playerPointerStart || event.pointerId !== playerPointerStart.id) return;
    const deltaY = event.clientY - playerPointerStart.y;
    const deltaX = event.clientX - playerPointerStart.x;
    if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY) * 1.15) return;
    event.preventDefault();
    const progress = Math.min(1, Math.max(0, deltaY / Math.max(1, playerPointerStart.height * 0.82)));
    player.classList.add('player-dragging');
    player.style.setProperty('--player-drag-transform', `translate3d(0, ${Math.max(0, deltaY)}px, 0) scale(${(1 - progress * 0.035).toFixed(3)})`);
    player.style.setProperty('--player-drag-opacity', (1 - progress * 0.18).toFixed(3));
  });
  function finishPlayerGesture(event, cancelled = false) {
    if (!playerPointerStart || event.pointerId !== playerPointerStart.id) return;
    const start = playerPointerStart;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const elapsed = Math.max(1, performance.now() - start.time);
    const velocityY = deltaY / elapsed;
    playerPointerStart = null;
    player.classList.remove('player-dragging');
    player.style.removeProperty('--player-drag-transform');
    player.style.removeProperty('--player-drag-opacity');
    if (cancelled) return;
    if (Math.abs(deltaX) > 72 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
      nextTrack(deltaX < 0 ? 1 : -1);
    } else if (deltaY > Math.max(118, start.height * 0.22) || (deltaY > 48 && velocityY > 0.72)) {
      closeNow();
    }
  }
  player.addEventListener('pointerup', event => finishPlayerGesture(event));
  player.addEventListener('pointercancel', event => finishPlayerGesture(event, true));

  let draggedQueueId = null;
  pageContent.addEventListener('dragstart', event => {
    const row = event.target.closest('[data-queue-item]');
    if (!row) return;
    draggedQueueId = row.dataset.queueItem;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedQueueId);
    row.classList.add('queue-row-dragging');
  });
  pageContent.addEventListener('dragend', event => {
    event.target.closest('[data-queue-item]')?.classList.remove('queue-row-dragging');
    draggedQueueId = null;
  });
  pageContent.addEventListener('dragover', event => {
    if (event.target.closest('[data-queue-item]') && draggedQueueId) event.preventDefault();
  });
  pageContent.addEventListener('drop', event => {
    const targetRow = event.target.closest('[data-queue-item]');
    if (!draggedQueueId || !targetRow) return;
    event.preventDefault();
    const from = app.queue.indexOf(draggedQueueId);
    const to = app.queue.indexOf(targetRow.dataset.queueItem);
    if (from < 0 || to < 0 || from === to) return;
    app.queue.splice(to, 0, app.queue.splice(from, 1)[0]);
    syncNativeQueue();
    savePlaybackState();
    renderPage();
    notify('Queue order updated.');
  });

  let miniTouchStart = null;
  document.getElementById('mini-player').addEventListener('touchstart', event => {
    const target = event.target;
    if (!target.closest('.mini-track') || event.touches.length !== 1) {
      miniTouchStart = null;
      return;
    }
    const touch = event.touches[0];
    miniTouchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  document.getElementById('mini-player').addEventListener('touchend', event => {
    if (!miniTouchStart || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const deltaY = touch.clientY - miniTouchStart.y;
    const deltaX = touch.clientX - miniTouchStart.x;
    miniTouchStart = null;
    if (deltaY < -58 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) openNow();
  }, { passive: true });

  const originalSaveLocalCatalog = saveLocalCatalog;
  saveLocalCatalog = function () {
    app.tracks = localTracks();
    return originalSaveLocalCatalog();
  };

  pageContent.addEventListener('click', event => {
    const mood = event.target.closest('[data-mood]');
    if (mood) {
      app.homeMood = mood.dataset.mood;
      renderPage();
      return;
    }
    if (event.target.closest('#home-settings')) setPage('settings');
  });

  document.getElementById('mini-player').addEventListener('click', event => {
    if (event.target.closest('#play-button') && !app.current) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const track = app.tracks[0];
      if (track) playTrack(track);
      else notify('Import audio from this device before pressing Play.');
    }
  }, true);

  document.getElementById('now-playing').addEventListener('click', event => {
    if (event.target.closest('#open-player-queue')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeNow();
      setPage('queue');
    }
  }, true);

  document.getElementById('now-playing').addEventListener('input', event => {
    if (event.target.id === 'now-volume-slider') {
      setPlaybackVolume(Number(event.target.value));
    }
  });

  document.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.repeat || event.target.matches('input,textarea,select,button')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (app.current) playTrack(app.current);
    else if (app.tracks.length) playTrack(app.tracks[0]);
    else notify('Import audio from this device before pressing Play.');
  }, true);

  renderPage();
})();
