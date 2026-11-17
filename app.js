/**
 * Pokédex Web Application conectada a Webhook de n8n
 * Implementación en JavaScript puro (Vanilla JS)
 */

// ==========================================
// CONFIGURACIÓN POR DEFECTO Y PERSISTENCIA
// ==========================================
const STORAGE_KEYS = {
  CONFIG: 'pokedex_n8n_config',
  HISTORY: 'pokedex_n8n_history'
};

const DEFAULT_CONFIG = {
  baseUrl: 'http://localhost:5678',
  mode: 'webhook', // 'webhook' (producción) o 'webhook-test' (test)
  path: 'prueba'
};

class PokedexApp {
  constructor() {
    this.config = this.loadConfig();
    this.history = this.loadHistory();
    this.lastSearchedPokemon = '';

    // Referencias al DOM
    this.dom = {
      // Pantallas / Estados
      screenDisplay: document.getElementById('screenDisplay'),
      stateIdle: document.getElementById('stateIdle'),
      stateLoading: document.getElementById('stateLoading'),
      stateSuccess: document.getElementById('stateSuccess'),
      stateError: document.getElementById('stateError'),
      statusLed: document.getElementById('statusLed'),

      // Elementos de datos de Pokémon
      pokeImage: document.getElementById('pokeImage'),
      pokeTitle: document.getElementById('pokeTitle'),
      pokeType: document.getElementById('pokeType'),
      pokeHeight: document.getElementById('pokeHeight'),
      pokeWeight: document.getElementById('pokeWeight'),
      errorMessage: document.getElementById('errorMessage'),
      btnRetry: document.getElementById('btnRetry'),

      // Formulario de búsqueda
      searchForm: document.getElementById('searchForm'),
      pokemonInput: document.getElementById('pokemonInput'),
      inputWrapper: document.querySelector('.search-input-wrapper'),
      btnClearSearch: document.getElementById('btnClearSearch'),
      btnSearch: document.getElementById('btnSearch'),

      // Sugerencias e Historial
      suggestionChips: document.querySelectorAll('.chip-btn'),
      historyList: document.getElementById('historyList'),
      btnClearHistory: document.getElementById('btnClearHistory'),

      // Modal de configuración
      btnOpenSettings: document.getElementById('btnOpenSettings'),
      btnCloseSettings: document.getElementById('btnCloseSettings'),
      settingsModal: document.getElementById('settingsModal'),
      settingsForm: document.getElementById('settingsForm'),
      cfgBaseUrl: document.getElementById('cfgBaseUrl'),
      cfgPath: document.getElementById('cfgPath'),
      fullUrlPreview: document.getElementById('fullUrlPreview'),
      btnRestoreDefaults: document.getElementById('btnRestoreDefaults')
    };

    this.init();
  }

  init() {
    this.bindEvents();
    this.renderHistory();
    this.updateStatusLed('ready');
    this.syncSettingsForm();
  }

  // ==========================================
  // GESTIÓN DE CONFIGURACIÓN
  // ==========================================
  loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (saved) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Error al leer configuración de localStorage:', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(this.config));
    } catch (e) {
      console.error('Error al guardar configuración en localStorage:', e);
    }
  }

  getWebhookUrl() {
    let base = (this.config.baseUrl || DEFAULT_CONFIG.baseUrl).trim();
    let mode = (this.config.mode || DEFAULT_CONFIG.mode).trim().replace(/^\/+|\/+$/g, '');
    let path = (this.config.path || DEFAULT_CONFIG.path).trim().replace(/^\/+/, '');

    // Limpieza inteligente si el usuario pegó la URL completa en el campo Base URL
    const match = base.match(/^(https?:\/\/[^\/]+)\/(webhook|webhook-test)(?:\/(.*))?$/i);
    if (match) {
      base = match[1];
      mode = match[2].toLowerCase();
      if (match[3]) {
        path = match[3];
      }
    } else {
      base = base.replace(/\/+$/, '');
    }

    return `${base}/${mode}/${path}`;
  }

  syncSettingsForm() {
    this.dom.cfgBaseUrl.value = this.config.baseUrl;
    this.dom.cfgPath.value = this.config.path;

    const radio = this.dom.settingsForm.querySelector(
      `input[name="webhookMode"][value="${this.config.mode}"]`
    );
    if (radio) radio.checked = true;

    this.updateUrlPreview();
  }

  updateUrlPreview() {
    let base = (this.dom.cfgBaseUrl.value || DEFAULT_CONFIG.baseUrl).trim();
    let selectedMode = this.dom.settingsForm.querySelector('input[name="webhookMode"]:checked')?.value || DEFAULT_CONFIG.mode;
    let path = (this.dom.cfgPath.value || DEFAULT_CONFIG.path).trim().replace(/^\/+/, '');

    // Detección automática al escribir/pegar URL completa en el campo Base URL
    const match = base.match(/^(https?:\/\/[^\/]+)\/(webhook|webhook-test)(?:\/(.*))?$/i);
    if (match) {
      this.dom.cfgBaseUrl.value = match[1];
      selectedMode = match[2].toLowerCase();
      const radio = this.dom.settingsForm.querySelector(`input[name="webhookMode"][value="${selectedMode}"]`);
      if (radio) radio.checked = true;
      if (match[3]) {
        this.dom.cfgPath.value = match[3];
        path = match[3];
      }
      base = match[1];
    } else {
      base = base.replace(/\/+$/, '');
    }

    this.dom.fullUrlPreview.textContent = `${base}/${selectedMode}/${path}`;
  }

  // ==========================================
  // EVENTOS
  // ==========================================
  bindEvents() {
    // Formulario de búsqueda
    this.dom.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = this.dom.pokemonInput.value.trim();
      if (query) {
        this.searchPokemon(query);
      }
    });

    // Control de input de texto y botón limpiar
    this.dom.pokemonInput.addEventListener('input', () => {
      const hasVal = Boolean(this.dom.pokemonInput.value.trim());
      this.dom.inputWrapper.classList.toggle('has-value', hasVal);
    });

    this.dom.btnClearSearch.addEventListener('click', () => {
      this.dom.pokemonInput.value = '';
      this.dom.inputWrapper.classList.remove('has-value');
      this.dom.pokemonInput.focus();
    });

    // Botones de sugerencias rápidas
    this.dom.suggestionChips.forEach((btn) => {
      btn.addEventListener('click', () => {
        const poke = btn.dataset.pokemon;
        if (poke) {
          this.dom.pokemonInput.value = poke;
          this.dom.inputWrapper.classList.add('has-value');
          this.searchPokemon(poke);
        }
      });
    });

    // Reintentar en pantalla de error
    this.dom.btnRetry.addEventListener('click', () => {
      if (this.lastSearchedPokemon) {
        this.searchPokemon(this.lastSearchedPokemon);
      }
    });

    // Historial: limpiar
    this.dom.btnClearHistory.addEventListener('click', () => {
      this.clearHistory();
    });

    // Modal de ajustes
    this.dom.btnOpenSettings.addEventListener('click', () => {
      this.syncSettingsForm();
      this.openModal();
    });

    this.dom.btnCloseSettings.addEventListener('click', () => {
      this.closeModal();
    });

    this.dom.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.dom.settingsModal) {
        this.closeModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.dom.settingsModal.classList.contains('hidden')) {
        this.closeModal();
      }
    });

    // Previsualización en vivo en modal
    this.dom.cfgBaseUrl.addEventListener('input', () => this.updateUrlPreview());
    this.dom.cfgPath.addEventListener('input', () => this.updateUrlPreview());
    this.dom.settingsForm.querySelectorAll('input[name="webhookMode"]').forEach((radio) => {
      radio.addEventListener('change', () => this.updateUrlPreview());
    });

    // Guardar ajustes
    this.dom.settingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const selectedMode = this.dom.settingsForm.querySelector('input[name="webhookMode"]:checked')?.value || 'webhook-test';
      this.saveConfig({
        baseUrl: this.dom.cfgBaseUrl.value.trim(),
        mode: selectedMode,
        path: this.dom.cfgPath.value.trim()
      });
      this.closeModal();
    });

    // Restaurar valores por defecto
    this.dom.btnRestoreDefaults.addEventListener('click', () => {
      this.dom.cfgBaseUrl.value = DEFAULT_CONFIG.baseUrl;
      this.dom.cfgPath.value = DEFAULT_CONFIG.path;
      const radio = this.dom.settingsForm.querySelector(
        `input[name="webhookMode"][value="${DEFAULT_CONFIG.mode}"]`
      );
      if (radio) radio.checked = true;
      this.updateUrlPreview();
    });
  }

  openModal() {
    this.dom.settingsModal.classList.remove('hidden');
    this.dom.cfgBaseUrl.focus();
  }

  closeModal() {
    this.dom.settingsModal.classList.add('hidden');
  }

  // ==========================================
  // ESTADOS DE LA PANTALLA
  // ==========================================
  setScreenState(state) {
    this.dom.stateIdle.classList.add('hidden');
    this.dom.stateLoading.classList.add('hidden');
    this.dom.stateSuccess.classList.add('hidden');
    this.dom.stateError.classList.add('hidden');

    switch (state) {
      case 'loading':
        this.dom.stateLoading.classList.remove('hidden');
        this.updateStatusLed('busy');
        this.dom.btnSearch.disabled = true;
        break;
      case 'success':
        this.dom.stateSuccess.classList.remove('hidden');
        this.updateStatusLed('ready');
        this.dom.btnSearch.disabled = false;
        break;
      case 'error':
        this.dom.stateError.classList.remove('hidden');
        this.updateStatusLed('error');
        this.dom.btnSearch.disabled = false;
        break;
      case 'idle':
      default:
        this.dom.stateIdle.classList.remove('hidden');
        this.updateStatusLed('ready');
        this.dom.btnSearch.disabled = false;
        break;
    }
  }

  updateStatusLed(status) {
    this.dom.statusLed.classList.remove('busy', 'offline');
    if (status === 'busy') {
      this.dom.statusLed.classList.add('busy');
    } else if (status === 'error') {
      this.dom.statusLed.classList.add('offline');
    }
  }

  // ==========================================
  // PETICIÓN HTTP POST A N8N
  // ==========================================
  async searchPokemon(pokemonQuery) {
    const query = String(pokemonQuery).trim().toLowerCase();
    if (!query) return;

    this.lastSearchedPokemon = query;
    this.setScreenState('loading');

    const webhookUrl = this.getWebhookUrl();

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Pinggy-No-Screen': 'true'
        },
        body: JSON.stringify({ pokemon: query })
      });

      if (!response.ok) {
        let errorDetail = `Error ${response.status}: No se pudo procesar la solicitud.`;
        try {
          const errData = await response.json();
          if (errData && errData.message) {
            if (response.status === 404) {
              errorDetail = `No se encontró el webhook en n8n (${errData.message}). ${errData.hint ? '(' + errData.hint + ')' : ''}`.trim();
            } else if (response.status === 500) {
              errorDetail = `El Pokémon "${query}" no fue encontrado en la base de datos o el workflow reportó un fallo.`;
            } else {
              errorDetail = `${errData.message} ${errData.hint ? '(' + errData.hint + ')' : ''}`.trim();
            }
          }
        } catch (_) {
          if (response.status === 404) {
            errorDetail = `Webhook no encontrado (404). Revisa la URL y el modo (Producción o Test) en Ajustes ⚙️.`;
          } else if (response.status === 500) {
            errorDetail = `Pokémon "${query}" no encontrado (Error 500). Verifica que el nombre o número sea correcto.`;
          }
        }
        throw new Error(errorDetail);
      }

      const rawData = await response.json();
      const data = Array.isArray(rawData) ? rawData[0] : rawData;

      // Validación de campos esperados según requisito 4
      if (!data || typeof data !== 'object') {
        throw new Error('La respuesta recibida de n8n no tiene un formato JSON válido.');
      }

      const { ficha, altura, peso, tipo_principal, imagen } = data;

      if (!ficha && !imagen && !tipo_principal) {
        throw new Error('La respuesta de n8n no contiene los campos esperados (ficha, altura, peso, tipo_principal, imagen).');
      }

      // Renderizar datos en pantalla
      this.renderPokemonData({
        ficha: ficha || query.toUpperCase(),
        altura: altura || 'Desconocida',
        peso: peso || 'Desconocido',
        tipo_principal: tipo_principal || 'normal',
        imagen: imagen || ''
      });

      // Guardar en el historial de sesión
      this.addToHistory({
        query,
        ficha: ficha || query.toUpperCase(),
        data: {
          ficha: ficha || query.toUpperCase(),
          altura: altura || 'Desconocida',
          peso: peso || 'Desconocido',
          tipo_principal: tipo_principal || 'normal',
          imagen: imagen || ''
        }
      });

      this.setScreenState('success');

    } catch (err) {
      console.error('Error al consultar webhook n8n:', err);
      let userMessage = err.message || 'No se pudo conectar con el webhook de n8n.';

      // Mensaje amigable para fallos de red / CORS
      if (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) {
        userMessage = `No hay conexión con n8n en "${webhookUrl}". Asegúrate de que n8n esté en ejecución, que el webhook esté activo o en escucha, y revisa posibles restricciones de CORS.`;
      }

      this.dom.errorMessage.textContent = userMessage;
      this.setScreenState('error');
    }
  }

  // ==========================================
  // RENDERIZADO DE DATOS DEL POKÉMON
  // ==========================================
  renderPokemonData(pokemon) {
    this.dom.pokeTitle.textContent = pokemon.ficha;
    this.dom.pokeHeight.textContent = pokemon.altura;
    this.dom.pokeWeight.textContent = pokemon.peso;

    // Tipo y distintivo de color
    const rawType = String(pokemon.tipo_principal || 'normal').toLowerCase().trim();
    this.dom.pokeType.textContent = rawType.toUpperCase();

    // Limpiar clases de tipos anteriores y aplicar la nueva
    this.dom.pokeType.className = 'type-badge';
    this.dom.pokeType.classList.add(`type-${rawType}`);

    // Imagen / Sprite con fallback
    if (pokemon.imagen) {
      this.dom.pokeImage.src = pokemon.imagen;
      this.dom.pokeImage.alt = `Sprite de ${pokemon.ficha}`;
      this.dom.pokeImage.onerror = () => {
        this.dom.pokeImage.onerror = null;
        this.dom.pokeImage.src = 'pokemon.png'; // Imagen local por defecto si la URL falla
      };
    } else {
      this.dom.pokeImage.src = 'pokemon.png';
      this.dom.pokeImage.alt = 'Imagen no disponible';
    }
  }

  // ==========================================
  // HISTORIAL DE SESIÓN
  // ==========================================
  loadHistory() {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEYS.HISTORY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Error al leer historial de sesión:', e);
    }
    return [];
  }

  saveHistory() {
    try {
      sessionStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(this.history));
    } catch (e) {
      console.error('Error al guardar historial de sesión:', e);
    }
  }

  addToHistory(entry) {
    // Evitar duplicados consecutivos o limitar a los 8 más recientes
    this.history = this.history.filter(item => item.query !== entry.query);
    this.history.unshift(entry);
    if (this.history.length > 8) {
      this.history.pop();
    }
    this.saveHistory();
    this.renderHistory();
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
    this.renderHistory();
  }

  renderHistory() {
    this.dom.historyList.innerHTML = '';

    if (this.history.length === 0) {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'history-empty';
      emptySpan.textContent = 'Sin consultas aún';
      this.dom.historyList.appendChild(emptySpan);
      return;
    }

    this.history.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'history-item';
      button.title = `Volver a ver ${item.ficha}`;
      button.innerHTML = `<span>⚡</span> <span>${item.ficha || item.query}</span>`;

      button.addEventListener('click', () => {
        this.dom.pokemonInput.value = item.query;
        this.dom.inputWrapper.classList.add('has-value');
        if (item.data) {
          // Mostrar inmediatamente los datos guardados en la sesión
          this.renderPokemonData(item.data);
          this.setScreenState('success');
        } else {
          // Si no tuviera datos guardados, consultar
          this.searchPokemon(item.query);
        }
      });

      this.dom.historyList.appendChild(button);
    });
  }
}

// Inicializar la aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  window.pokedexApp = new PokedexApp();
});