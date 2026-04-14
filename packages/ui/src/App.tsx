import './App.css'
import { ThemeToggle } from './components/ThemeToggle'

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border p-4 flex justify-between items-center">
        <h1 className="text-3xl font-bold">M10 Lite UI</h1>
        <ThemeToggle />
      </header>
      <main className="p-6">
        <p className="text-muted-foreground">React + Vite + Shadcn/ui</p>
      </main>
    </div>
  )
}

export default App
