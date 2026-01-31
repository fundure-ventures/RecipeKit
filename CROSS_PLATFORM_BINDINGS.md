# Cross-Platform Bindings Feasibility Study

Este documento analiza la viabilidad de crear bindings para la librería Engine de RecipeKit para compilar directamente a iOS, Android y TypeScript para server-side via Bun.

## Resumen Ejecutivo

| Plataforma | Viabilidad | Complejidad | Esfuerzo Estimado |
|------------|------------|-------------|-------------------|
| TypeScript/Bun (Server) | ✅ Nativa | Baja | Ya implementado |
| iOS (Swift) | 🟡 Media | Alta | 3-6 meses |
| Android (Kotlin/Java) | 🟡 Media | Alta | 3-6 meses |

## Arquitectura Actual

El Engine de RecipeKit está construido con:

```
Engine/
├── engine.js           # Punto de entrada CLI
├── package.json        # Dependencias (puppeteer, chalk, lodash)
└── src/
    ├── browser.js      # BrowserManager - Puppeteer para automatización web
    ├── commands.js     # StepExecutor - Ejecutores de comandos
    ├── logger.js       # Sistema de logging
    └── recipe.js       # RecipeEngine - Motor principal
```

### Componentes Clave

1. **RecipeEngine**: Motor principal que gestiona variables y ejecuta recetas
2. **StepExecutor**: Maneja los comandos individuales (load, store_text, regex, etc.)
3. **BrowserManager**: Wrapper de Puppeteer para automatización del navegador
4. **Logger**: Sistema de logging singleton

### Dependencias Críticas

- **Puppeteer**: Automatización de Chrome/Chromium (headless browser)
- **Bun**: Runtime de JavaScript (alternativa a Node.js)
- **Lodash**: Utilidades para manipulación de datos (_.get para JSON paths)
- **Chalk**: Colorización de output en terminal

---

## 1. TypeScript/Bun Server-Side

### Estado: ✅ Ya Implementado

El Engine **ya está escrito en JavaScript moderno** que es totalmente compatible con TypeScript y ejecutado con Bun.

### Mejoras Recomendadas

Para mejorar la experiencia de desarrollo y type-safety:

#### Opción A: Añadir tipos TypeScript (recomendado)

```typescript
// Crear types/recipe.d.ts
interface Recipe {
  list_type: string;
  title: string;
  description: string;
  engine_version: string;
  url_available: string[];
  autocomplete_steps: Step[];
  url_steps: Step[];
}

interface Step {
  command: StepCommand;
  locator?: string;
  input?: string;
  url?: string;
  expression?: string;
  attribute_name?: string;
  output?: StepOutput;
  config?: StepConfig;
  description?: string;
}

type StepCommand = 
  | 'load' 
  | 'store_attribute' 
  | 'store_text' 
  | 'store_array'
  | 'regex' 
  | 'store' 
  | 'api_request'
  | 'json_store_text'
  | 'url_encode'
  | 'store_url'
  | 'replace';
```

#### Opción B: Convertir completamente a TypeScript

Cambios necesarios:
1. Renombrar archivos `.js` a `.ts`
2. Añadir interfaces y tipos
3. Actualizar `package.json` con configuración TypeScript
4. Crear `tsconfig.json`

**Esfuerzo estimado**: 1-2 semanas

---

## 2. iOS Bindings (Swift)

### Desafíos Principales

1. **Puppeteer no existe en iOS**: Puppeteer depende de Chrome/Chromium que no está disponible en iOS
2. **Restricciones de App Store**: Apple no permite motores de navegador alternativos
3. **WebKit es la única opción**: Usar WKWebView para automatización web

### Opciones de Implementación

#### Opción A: Reescritura Nativa en Swift (Recomendada)

Crear una implementación nativa que use WKWebView:

```swift
// RecipeEngine.swift
import WebKit

class RecipeEngine {
    private var variables: [String: Any] = [:]
    private var webView: WKWebView
    
    func executeRecipe(_ recipe: Recipe, stepType: StepType, input: String) async throws -> [String: Any] {
        setInput(input)
        let steps = stepType == .autocomplete ? recipe.autocompleteSteps : recipe.urlSteps
        for step in steps {
            try await executeStep(step)
        }
        return variables
    }
    
    private func executeStep(_ step: Step) async throws {
        switch step.command {
        case .load:
            try await executeLoadStep(step)
        case .storeText:
            try await executeStoreTextStep(step)
        case .storeAttribute:
            try await executeStoreAttributeStep(step)
        // ... otros comandos
        }
    }
    
    private func executeLoadStep(_ step: Step) async throws {
        guard let urlString = replaceVariables(step.url),
              let url = URL(string: urlString) else { return }
        
        let request = URLRequest(url: url)
        return try await withCheckedThrowingContinuation { continuation in
            webView.load(request)
            // Manejar navegación completada
        }
    }
    
    private func executeStoreTextStep(_ step: Step) async throws {
        let selector = replaceVariables(step.locator ?? "")
        let js = """
            document.querySelector('\(selector)')?.textContent?.trim() || ''
        """
        let result = try await webView.evaluateJavaScript(js)
        if let outputName = step.output?.name {
            variables[outputName] = result
        }
    }
}
```

**Ventajas**:
- Rendimiento nativo
- Integración perfecta con el ecosistema iOS
- Acceso completo a APIs de iOS

**Desventajas**:
- Mantenimiento de dos codebases
- Posibles diferencias de comportamiento entre Puppeteer y WKWebView

**Esfuerzo estimado**: 3-4 meses

#### Opción B: JavaScript Core Bridge

Ejecutar el código JavaScript existente en JavaScriptCore:

```swift
import JavaScriptCore

class JSRecipeEngine {
    private let context: JSContext
    
    init() {
        context = JSContext()!
        // Cargar polyfills y el código del engine
        loadEngineCode()
        bridgeBrowserAPIs()
    }
    
    private func bridgeBrowserAPIs() {
        // Implementar fetch, DOM APIs, etc.
        let fetch: @convention(block) (String, [String: Any]?) -> JSValue = { url, options in
            // Implementar fetch nativo
        }
        context.setObject(fetch, forKeyedSubscript: "fetch" as NSString)
    }
}
```

**Ventajas**:
- Reutiliza la lógica existente
- Un solo codebase para la lógica de negocio

**Desventajas**:
- Necesita implementar muchas APIs del navegador
- Complejidad en el bridge de Puppeteer

**Esfuerzo estimado**: 4-6 meses

#### Opción C: WebAssembly (Experimental)

Compilar partes del engine a WebAssembly y ejecutar en iOS.

**Estado**: No recomendado actualmente debido a la dependencia de Puppeteer.

---

## 3. Android Bindings (Kotlin/Java)

### Desafíos Principales

1. **Puppeteer no disponible**: Igual que en iOS, Puppeteer no funciona en Android
2. **WebView limitado**: Android WebView tiene limitaciones similares a iOS WKWebView
3. **Alternativas existentes**: Selenium/Appium para automatización, pero pesados

### Opciones de Implementación

#### Opción A: Reescritura Nativa en Kotlin (Recomendada)

```kotlin
// RecipeEngine.kt
import android.webkit.WebView
import kotlinx.coroutines.*

class RecipeEngine(private val webView: WebView) {
    private val variables = mutableMapOf<String, Any?>()
    
    suspend fun executeRecipe(
        recipe: Recipe, 
        stepType: StepType, 
        input: String
    ): Map<String, Any?> = withContext(Dispatchers.Main) {
        setInput(input)
        val steps = when (stepType) {
            StepType.AUTOCOMPLETE -> recipe.autocompleteSteps
            StepType.URL -> recipe.urlSteps
        }
        steps.forEach { step -> executeStep(step) }
        variables.toMap()
    }
    
    private suspend fun executeStep(step: Step) {
        when (step.command) {
            "load" -> executeLoadStep(step)
            "store_text" -> executeStoreTextStep(step)
            "store_attribute" -> executeStoreAttributeStep(step)
            "regex" -> executeRegexStep(step)
            "api_request" -> executeApiRequestStep(step)
            // ... otros comandos
        }
    }
    
    private suspend fun executeLoadStep(step: Step) {
        val url = replaceVariables(step.url ?: return)
        suspendCancellableCoroutine<Unit> { continuation ->
            webView.webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    continuation.resume(Unit)
                }
            }
            webView.loadUrl(url)
        }
    }
    
    private suspend fun executeStoreTextStep(step: Step) {
        val selector = replaceVariables(step.locator ?: return)
        val js = "document.querySelector('$selector')?.textContent?.trim() || ''"
        val result = evaluateJavaScript(js)
        step.output?.name?.let { variables[it] = result }
    }
}
```

**Ventajas**:
- Rendimiento nativo
- Integración con el ecosistema Android
- Acceso a APIs nativas de Android

**Desventajas**:
- Mantenimiento de otra codebase
- Testing duplicado

**Esfuerzo estimado**: 3-4 meses

#### Opción B: Node.js en Android (react-native-nodejs-mobile)

Ejecutar Node.js/Bun embebido en la app Android.

```kotlin
// Usar nodejs-mobile-android
implementation 'org.pyt:nodejs-mobile-android:0.1.3'

// Ejecutar el engine JavaScript directamente
val nodeJs = NodeJsThread()
nodeJs.eval("const { RecipeEngine } = require('./engine.js')")
```

**Ventajas**:
- Reutiliza código existente
- Menos trabajo de portabilidad

**Desventajas**:
- Overhead de memoria significativo
- Complejidad de integración
- Puppeteer sigue sin funcionar

**Esfuerzo estimado**: 2-3 meses (sin Puppeteer functionality)

---

## 4. Arquitectura Compartida Recomendada

Para maximizar la reutilización de código, se recomienda una arquitectura en capas:

```
┌─────────────────────────────────────────────────────────┐
│                    Recipe JSON Files                     │
│                  (Shared across all platforms)           │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    Core Logic Layer                      │
│         (Variable management, JSON parsing, Regex)       │
│                                                         │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   │  TypeScript   │  │    Swift      │  │    Kotlin     │
│   │   (Shared)    │  │   (Native)    │  │   (Native)    │
│   └───────────────┘  └───────────────┘  └───────────────┘
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  Browser Abstraction Layer               │
│                                                         │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   │   Puppeteer   │  │   WKWebView   │  │ Android WebView│
│   │   (Server)    │  │    (iOS)      │  │   (Android)   │
│   └───────────────┘  └───────────────┘  └───────────────┘
└─────────────────────────────────────────────────────────┘
```

### Cambios Necesarios en el Codebase Actual

#### 1. Separar la lógica del browser (Prioridad Alta)

```javascript
// src/browser-interface.js - Nueva interfaz abstracta
export class BrowserInterface {
    async loadPage(url, options) { throw new Error('Not implemented'); }
    async querySelector(selector) { throw new Error('Not implemented'); }
    async evaluateScript(script) { throw new Error('Not implemented'); }
    // ... otros métodos
}

// src/browser-puppeteer.js - Implementación actual
export class PuppeteerBrowser extends BrowserInterface {
    // ... implementación con Puppeteer
}
```

#### 2. Crear un módulo de Core puro (Prioridad Alta)

```javascript
// src/core/variable-manager.js
export class VariableManager {
    constructor() {
        this.variables = {};
    }
    
    set(key, value) { /* ... */ }
    get(key) { /* ... */ }
    replaceVariables(str) { /* ... */ }
}

// src/core/step-parser.js  
export class StepParser {
    parseStep(step) { /* ... */ }
    expandLoops(steps) { /* ... */ }
}
```

#### 3. Definir un protocolo/interfaz común

```typescript
// types/engine-protocol.ts
interface IRecipeEngine {
    executeRecipe(recipe: Recipe, stepType: StepType, input: string): Promise<Results>;
    close(): Promise<void>;
}

interface IBrowserManager {
    loadPage(url: string, options: LoadOptions): Promise<void>;
    querySelector(selector: string): Promise<Element | null>;
    evaluateScript(script: string): Promise<any>;
}
```

---

## 5. Alternativa: API Server

En lugar de bindings nativos, considerar una arquitectura cliente-servidor:

```
┌─────────────┐     HTTP/WebSocket    ┌─────────────────────┐
│  iOS App    │ ◄──────────────────► │                     │
└─────────────┘                       │   RecipeKit API     │
                                      │   (Bun Server)      │
┌─────────────┐     HTTP/WebSocket    │                     │
│ Android App │ ◄──────────────────► │  - Full Puppeteer   │
└─────────────┘                       │  - All commands     │
                                      │  - Centralized      │
└─────────────────────────────────────┘
```

### Ventajas
- Un solo codebase para mantener
- Las apps móviles son clientes ligeros
- Actualización instantánea de recetas y engine
- Sin problemas de compatibilidad de browser

### Desventajas  
- Requiere conexión a internet
- Latencia de red
- Costos de infraestructura
- No funciona offline

---

## 6. Recomendación Final

### Para implementación inmediata (1-2 meses):

1. **Mejorar TypeScript Support**: Añadir tipos y mejorar DX
2. **Refactorizar el Engine**: Separar core logic de browser implementation
3. **Documentar API interna**: Para facilitar ports futuros

### Para implementación a mediano plazo (3-6 meses):

1. **iOS**: Reescritura nativa en Swift usando WKWebView
2. **Android**: Reescritura nativa en Kotlin usando Android WebView
3. **Shared**: Mantener recetas JSON como formato universal

### Para consideración futura:

1. **API Server**: Como alternativa a bindings nativos
2. **React Native**: Si se necesita una solución híbrida
3. **Capacitor/Ionic**: Para apps web empaquetadas

---

## 7. Estimación de Esfuerzo

| Tarea | Tiempo | Recursos |
|-------|--------|----------|
| TypeScript types | 1-2 semanas | 1 dev JS/TS |
| Refactorización Core | 2-3 semanas | 1 dev JS/TS |
| iOS Swift Port | 3-4 meses | 1-2 devs iOS |
| Android Kotlin Port | 3-4 meses | 1-2 devs Android |
| Testing & QA | 1-2 meses | 1 QA + devs |
| **Total (paralelo)** | **5-7 meses** | **2-4 devs** |

---

## 8. Próximos Pasos Sugeridos

1. ✅ Análisis de viabilidad completado (este documento)
2. [ ] Decidir arquitectura (nativa vs API server)
3. [ ] Crear prototype de refactorización del Core
4. [ ] Implementar iOS/Android según prioridad del negocio
5. [ ] Establecer testing cross-platform
6. [ ] Documentación de API unificada

---

## Apéndice: Código de Referencia

### A. Estructura propuesta del Core refactorizado

```
Engine/
├── src/
│   ├── core/                    # Lógica pura sin dependencias de browser
│   │   ├── variable-manager.ts
│   │   ├── step-parser.ts
│   │   ├── regex-executor.ts
│   │   └── json-extractor.ts
│   ├── browser/                 # Implementaciones de browser
│   │   ├── browser-interface.ts
│   │   ├── puppeteer-browser.ts
│   │   └── (futuro: webkit-browser.ts)
│   ├── commands/                # Ejecutores de comandos
│   │   ├── command-registry.ts
│   │   ├── load-command.ts
│   │   ├── store-commands.ts
│   │   └── transform-commands.ts
│   ├── recipe-engine.ts         # Orquestador principal
│   └── index.ts                 # Exports públicos
├── types/                       # Definiciones TypeScript
│   ├── recipe.d.ts
│   ├── commands.d.ts
│   └── results.d.ts
└── platforms/                   # Implementaciones por plataforma
    ├── bun/                     # Actual (server-side)
    ├── ios/                     # Futuro
    └── android/                 # Futuro
```

### B. Ejemplo de recipe parser compartido

```typescript
// core/recipe-parser.ts
export function parseRecipe(json: string): Recipe {
    const data = JSON.parse(json);
    validateRecipe(data);
    return {
        listType: data.list_type,
        title: data.title,
        engineVersion: data.engine_version,
        urlAvailable: data.url_available,
        autocompleteSteps: data.autocomplete_steps.map(parseStep),
        urlSteps: data.url_steps.map(parseStep),
    };
}

function parseStep(step: any): Step {
    return {
        command: step.command as StepCommand,
        locator: step.locator,
        input: step.input,
        url: step.url,
        expression: step.expression,
        attributeName: step.attribute_name,
        output: step.output ? {
            name: step.output.name,
            type: step.output.type,
            show: step.output.show ?? false,
        } : undefined,
        config: step.config,
        description: step.description,
    };
}
```

---

*Documento creado: 2026-01-31*
*Autor: GitHub Copilot Agent*
*Versión: 1.0*
