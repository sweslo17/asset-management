import { useState, type FormEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { getStoredApiKey, setStoredApiKey } from '@/api/client'

interface AuthGateProps {
  children: React.ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const [apiKey, setApiKey] = useState(() => getStoredApiKey())
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  if (apiKey) {
    return <>{children}</>
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) {
      setError('請輸入 API 金鑰')
      return
    }
    setStoredApiKey(trimmed)
    setApiKey(trimmed)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">投資組合管理</CardTitle>
          <p className="text-sm text-muted-foreground">請輸入 API 金鑰以繼續</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">API 金鑰</Label>
              <Input
                id="api-key"
                type="password"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  setError('')
                }}
                placeholder="輸入你的 API 金鑰"
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <Button type="submit" className="w-full">
              登入
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
