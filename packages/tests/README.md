# MotifJS Component Test Suite

Comprehensive test suite for motifjs Component class covering lifecycle, bindings, stress testing, and benchmarks.

## Test Structure

```
src/
├── application/                       # Application lifecycle events
├── common/                            # MotifError diagnostics, Query
├── components/
│   ├── component.lifecycle.test.ts    # Lifecycle hooks tests
│   ├── component.binding.test.ts      # Data binding tests
│   ├── component.stress.test.ts       # Stress and load tests
│   ├── component.benchmark.test.ts    # Performance benchmarks
│   └── *.test.ts                      # JSX, transitions, DI, virtualization and other focused tests
├── memory/                            # Dispose chain and GC collectability tests
├── routing/                           # Router, navigation, guards, scroll memory
├── store/                             # Reactivity: reactive, effect, computed, signal
└── helpers/
    └── test-utils.ts                  # Shared test utilities
```

## Test Categories

### 1. Lifecycle Tests (`component.lifecycle.test.ts`)

Tests all component lifecycle hooks and their execution order:

- **Basic Lifecycle Hooks**: onInitializing, onInitialized, onConfig, onConfigured, initializeComponent, onBuilding, onBuilt
- **Disposal Lifecycle**: onDisposing, onDisposed, proper cleanup
- **Visibility Lifecycle**: onVisibilityChanged, show/hide operations
- **Config Lifecycle**: Configuration phase management
- **Advanced Scenarios**: Rapid cycles, nested components, error handling
- **Wait State**: isWait flag behavior

**Key Features Tested:**
- Correct execution order of lifecycle hooks
- State flags (isBuilt, isDisposed, isVisible, isConfigured)
- Parent-child lifecycle coordination
- Error recovery in lifecycle hooks
- Multiple lifecycle hook aggregation

### 2. Binding Tests (`component.binding.test.ts`)

Tests reactive data binding mechanisms:

- **Text Binding**: Reactive text content updates
- **Value Binding**: Input element value synchronization
- **Custom Property Binding**: Arbitrary property binding
- **Display Binding**: Visibility based on reactive data
- **Wait Binding**: Loading state management
- **Method Binding**: Reactive method execution
- **Conditional Binding**: Conditional rendering with `when`
- **List Binding**: Dynamic list rendering and updates

**Key Features Tested:**
- Reactivity system integration
- Binding activation/deactivation lifecycle
- Multiple bindings on single component
- Binding performance with mass updates
- Memory cleanup on disposal
- Error handling in binding expressions

### 3. Stress Tests (`component.stress.test.ts`)

Tests component behavior under extreme conditions:

- **Large Component Trees**: Deep nesting (50 levels), wide trees (1000 children)
- **Rapid Operations**: Fast creation/disposal cycles
- **Heavy Binding Load**: 200+ components with reactive bindings
- **Visibility Toggle Stress**: Rapid show/hide cycles
- **Memory Management**: Memory leak detection
- **Event Handler Stress**: Many event listeners
- **Concurrent Operations**: Parallel build and update operations
- **Error Recovery**: Graceful error handling

**Load Scenarios:**
- 1000+ component creation/disposal cycles
- 100+ rapid show/hide cycles
- 200+ components with synchronized bindings
- Deep nesting up to 50 levels
- Concurrent state updates

### 4. Benchmark Tests (`component.benchmark.test.ts`)

Performance benchmarks for component operations:

- **Creation Benchmarks**: Simple creation, with props, tree creation
- **Build Benchmarks**: Build performance, with children, DOM attachment
- **Update Benchmarks**: Text, style, class updates
- **Binding Benchmarks**: Single/multiple bindings, complex expressions
- **Visibility Benchmarks**: Show/hide, toggle operations
- **Disposal Benchmarks**: Simple disposal, tree disposal
- **Event Handling Benchmarks**: Registration, triggering
- **Memory Benchmarks**: Memory usage per component
- **Comparative Benchmarks**: Component vs native createElement

**Metrics Measured:**
- Duration (milliseconds)
- Operations per second
- Memory usage (MB)
- Overhead vs native DOM operations

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
# Lifecycle tests
npm test -- component.lifecycle.test

# Binding tests
npm test -- component.binding.test

# Stress tests
npm test -- component.stress.test

# Benchmark tests
npm test -- component.benchmark.test
```

### Run with Coverage
```bash
npm test -- --coverage
```

### Run in Watch Mode
```bash
npm test -- --watch
```

## Test Utilities

The `test-utils.ts` file provides helper functions:

- **Timing**: `wait()`, `nextTick()`, `nextFrame()`, `waitFor()`
- **DOM**: `createTestContainer()`, `cleanupTestContainer()`, `waitForElement()`
- **Performance**: `measurePerformance()`, `measureMemory()`
- **Utilities**: `createSpy()`, `isVisible()`, `triggerEvent()`, `simulateInput()`

## Expected Results

### Lifecycle Tests
- All lifecycle hooks should execute in correct order
- Component state should be properly managed
- Disposal should clean up all resources
- Error handling should be graceful

### Binding Tests
- Reactive updates should propagate correctly
- Bindings should activate/deactivate with component lifecycle
- Multiple bindings should work independently
- Performance should be acceptable for typical use cases

### Stress Tests
- Should handle 1000+ components without crashing
- Memory usage should be stable
- Performance should remain acceptable under load
- Error recovery should prevent cascade failures

### Benchmark Results
Expected performance targets:
- Component creation: >1000 ops/sec
- Text updates: >1000 ops/sec
- Binding updates: >500 ops/sec (50 components)
- Show/hide: >200 ops/sec
- Disposal: >500 ops/sec

## Known Limitations

1. **Animation Tests**: Animation-related tests may be timing-sensitive
2. **Memory Tests**: Requires `--expose-gc` flag for accurate garbage collection testing (`npm run test:memory`)
3. **Stress Tests**: May timeout on slower machines (timeout set to 30s)
4. **DOM Tests**: Requires jsdom environment

## Contributing

When adding new tests:

1. Place tests in appropriate category file
2. Use descriptive test names
3. Clean up resources in `afterEach`
4. Use test utilities from `test-utils.ts`
5. Set appropriate timeouts for async tests
6. Add benchmark results to summary

## Test Coverage Goals

- **Line Coverage**: >80%
- **Branch Coverage**: >75%
- **Function Coverage**: >80%
- **Statement Coverage**: >80%

## Debugging Tests

### Enable Verbose Output
```bash
npm test -- --verbose
```

### Run Single Test
```bash
npm test -- -t "test name"
```

### Debug in VS Code
Use the Jest extension or add breakpoints and run in debug mode.

## Performance Optimization

The test suite is optimized for:
- Fast feedback (most tests complete in <100ms)
- Parallel execution where possible
- Minimal setup/teardown overhead
- Efficient memory usage

## Next Steps

Future test additions:
- [ ] Browser compatibility tests
- [ ] E2E integration tests
