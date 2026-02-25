import { useState, useMemo, useEffect } from 'react'
import type { TickerTag, Investment } from '@/api/types'
import { useUpsertTickerTags, useDeleteDimension, useRenameDimension } from '@/hooks/useMutations'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface TagManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tickerTags: TickerTag[]
  investments: Investment[]
}

const UNTAGGED = '__untagged__'
const NEW_TAG_VALUE = '__new_tag__'

export function TagManagementDialog({
  open,
  onOpenChange,
  tickerTags,
  investments,
}: TagManagementDialogProps) {
  const upsertMutation = useUpsertTickerTags()
  const deleteDimMutation = useDeleteDimension()
  const renameDimMutation = useRenameDimension()

  // Derive unique tickers with their names from investments
  const uniqueTickers = useMemo(() => {
    const map = new Map<string, string>()
    for (const inv of investments) {
      if (!map.has(inv.ticker)) {
        map.set(inv.ticker, inv.name)
      }
    }
    return Array.from(map.entries())
      .map(([ticker, name]) => ({ ticker, name }))
      .sort((a, b) => a.ticker.localeCompare(b.ticker))
  }, [investments])

  // Derive existing dimensions
  const existingDimensions = useMemo(() => {
    const dims = new Set<string>()
    for (const tt of tickerTags) {
      dims.add(tt.dimension)
    }
    return Array.from(dims).sort()
  }, [tickerTags])

  // Local state: working copy of assignments per dimension
  const [localAssignments, setLocalAssignments] = useState<Map<string, Map<string, string>>>(new Map())
  const [activeDimension, setActiveDimension] = useState<string>('')
  const [newDimensionName, setNewDimensionName] = useState('')
  const [showNewDimensionInput, setShowNewDimensionInput] = useState(false)
  const [renamingDimension, setRenamingDimension] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [newTagInputs, setNewTagInputs] = useState<Map<string, string>>(new Map())

  // Initialize local state from props when dialog opens
  useEffect(() => {
    if (open) {
      const map = new Map<string, Map<string, string>>()
      for (const tt of tickerTags) {
        if (!map.has(tt.dimension)) {
          map.set(tt.dimension, new Map())
        }
        map.get(tt.dimension)!.set(tt.ticker, tt.tag)
      }
      setLocalAssignments(map)
      setActiveDimension(existingDimensions[0] ?? '')
      setShowNewDimensionInput(false)
      setRenamingDimension(null)
      setNewTagInputs(new Map())
    }
  }, [open, tickerTags, existingDimensions])

  // All dimensions (including locally added ones)
  const allDimensions = useMemo(() => {
    return Array.from(localAssignments.keys()).sort()
  }, [localAssignments])

  // Existing tags for current dimension
  const currentDimensionTags = useMemo(() => {
    const dimMap = localAssignments.get(activeDimension)
    if (!dimMap) return []
    const tags = new Set<string>()
    for (const tag of dimMap.values()) {
      if (tag) tags.add(tag)
    }
    return Array.from(tags).sort()
  }, [localAssignments, activeDimension])

  const getTickerTag = (ticker: string): string => {
    return localAssignments.get(activeDimension)?.get(ticker) ?? UNTAGGED
  }

  const setTickerTag = (ticker: string, tag: string) => {
    setLocalAssignments((prev) => {
      const next = new Map(prev)
      const dimMap = new Map(next.get(activeDimension) ?? new Map())
      if (tag === UNTAGGED) {
        dimMap.delete(ticker)
      } else {
        dimMap.set(ticker, tag)
      }
      next.set(activeDimension, dimMap)
      return next
    })
  }

  const handleAddDimension = () => {
    const name = newDimensionName.trim()
    if (!name || localAssignments.has(name)) return
    setLocalAssignments((prev) => {
      const next = new Map(prev)
      next.set(name, new Map())
      return next
    })
    setActiveDimension(name)
    setNewDimensionName('')
    setShowNewDimensionInput(false)
  }

  const handleDeleteDimension = async (dim: string) => {
    if (!confirm(`確定要刪除維度「${dim}」及其所有標籤？`)) return
    // If it exists on server, delete there too
    if (existingDimensions.includes(dim)) {
      await deleteDimMutation.mutateAsync(dim)
    }
    // Compute remaining before the async state update
    const remaining = Array.from(localAssignments.keys()).filter((d) => d !== dim)
    setLocalAssignments((prev) => {
      const next = new Map(prev)
      next.delete(dim)
      return next
    })
    setActiveDimension(remaining[0] ?? '')
  }

  const handleRenameDimension = async (oldName: string) => {
    const newName = renameValue.trim()
    if (!newName || newName === oldName || localAssignments.has(newName)) return
    // If it exists on server, rename there
    if (existingDimensions.includes(oldName)) {
      await renameDimMutation.mutateAsync({ name: oldName, newName })
    }
    setLocalAssignments((prev) => {
      const next = new Map(prev)
      const dimMap = next.get(oldName)
      if (dimMap) {
        next.delete(oldName)
        next.set(newName, dimMap)
      }
      return next
    })
    setActiveDimension(newName)
    setRenamingDimension(null)
    setRenameValue('')
  }

  const handleSave = async () => {
    const assignments: TickerTag[] = []

    // Current assignments
    for (const [dimension, dimMap] of localAssignments) {
      for (const [ticker, tag] of dimMap) {
        if (tag) {
          assignments.push({ ticker, dimension, tag })
        }
      }
    }

    // Detect removed assignments: was in tickerTags but no longer in localAssignments
    // Send with empty tag to trigger backend deletion
    for (const tt of tickerTags) {
      const dimMap = localAssignments.get(tt.dimension)
      if (!dimMap || !dimMap.has(tt.ticker)) {
        assignments.push({ ticker: tt.ticker, dimension: tt.dimension, tag: '' })
      }
    }

    await upsertMutation.mutateAsync({ assignments })
    onOpenChange(false)
  }

  const handleNewTagForTicker = (ticker: string) => {
    const tagValue = (newTagInputs.get(ticker) ?? '').trim()
    if (!tagValue) return
    setTickerTag(ticker, tagValue)
    setNewTagInputs((prev) => {
      const next = new Map(prev)
      next.delete(ticker)
      return next
    })
  }

  const untaggedCount = uniqueTickers.filter((t) => getTickerTag(t.ticker) === UNTAGGED).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>管理標籤維度</DialogTitle>
          <DialogDescription>
            為每個標的在各維度下指定分類標籤
          </DialogDescription>
        </DialogHeader>

        {/* Dimension tabs */}
        {allDimensions.length > 0 ? (
          <Tabs value={activeDimension} onValueChange={setActiveDimension}>
            <div className="flex items-center gap-2">
              <TabsList className="flex-1 overflow-x-auto">
                {allDimensions.map((dim) => (
                  <TabsTrigger key={dim} value={dim}>
                    {dim}
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewDimensionInput(true)}
              >
                +
              </Button>
            </div>

            {allDimensions.map((dim) => (
              <TabsContent key={dim} value={dim}>
                {/* Dimension header */}
                <div className="flex items-center justify-between mb-3">
                  {renamingDimension === dim ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="w-40 h-8"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameDimension(dim)
                          if (e.key === 'Escape') setRenamingDimension(null)
                        }}
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" onClick={() => handleRenameDimension(dim)}>
                        確認
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRenamingDimension(null)}>
                        取消
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{dim}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRenamingDimension(dim)
                          setRenameValue(dim)
                        }}
                      >
                        重新命名
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDeleteDimension(dim)}
                      >
                        刪除
                      </Button>
                    </div>
                  )}
                  {untaggedCount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {untaggedCount} 個未分類
                    </Badge>
                  )}
                </div>

                <Separator className="mb-3" />

                {/* Ticker assignment table */}
                <div className="space-y-2">
                  {uniqueTickers.map((t) => {
                    const currentTag = getTickerTag(t.ticker)
                    const isNewTagMode = newTagInputs.has(t.ticker)

                    return (
                      <div
                        key={t.ticker}
                        className={`flex items-center justify-between gap-3 rounded px-2 py-1.5 ${currentTag === UNTAGGED ? 'bg-muted/50' : ''}`}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium">{t.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{t.ticker}</span>
                        </div>
                        <div className="w-44">
                          {isNewTagMode ? (
                            <div className="flex gap-1">
                              <Input
                                className="h-8 text-sm"
                                value={newTagInputs.get(t.ticker) ?? ''}
                                onChange={(e) =>
                                  setNewTagInputs((prev) => new Map(prev).set(t.ticker, e.target.value))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleNewTagForTicker(t.ticker)
                                  if (e.key === 'Escape') {
                                    setNewTagInputs((prev) => {
                                      const next = new Map(prev)
                                      next.delete(t.ticker)
                                      return next
                                    })
                                  }
                                }}
                                placeholder="輸入新標籤..."
                                autoFocus
                              />
                              <Button size="sm" variant="ghost" onClick={() => handleNewTagForTicker(t.ticker)}>
                                OK
                              </Button>
                            </div>
                          ) : (
                            <Select
                              value={currentTag}
                              onValueChange={(val) => {
                                if (val === NEW_TAG_VALUE) {
                                  setNewTagInputs((prev) => new Map(prev).set(t.ticker, ''))
                                } else {
                                  setTickerTag(t.ticker, val)
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="選擇標籤" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={UNTAGGED}>未分類</SelectItem>
                                {currentDimensionTags.map((tag) => (
                                  <SelectItem key={tag} value={tag}>
                                    {tag}
                                  </SelectItem>
                                ))}
                                <SelectItem value={NEW_TAG_VALUE}>+ 新增標籤...</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <p>尚未建立任何維度</p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => setShowNewDimensionInput(true)}
            >
              建立第一個維度
            </Button>
          </div>
        )}

        {/* New dimension input */}
        {showNewDimensionInput && (
          <div className="flex items-end gap-2 mt-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">新維度名稱</Label>
              <Input
                value={newDimensionName}
                onChange={(e) => setNewDimensionName(e.target.value)}
                placeholder="例：地區、類型、資產"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddDimension()
                  if (e.key === 'Escape') setShowNewDimensionInput(false)
                }}
                autoFocus
              />
            </div>
            <Button size="sm" onClick={handleAddDimension}>
              新增
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNewDimensionInput(false)}>
              取消
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={upsertMutation.isPending}>
            {upsertMutation.isPending ? '儲存中...' : '儲存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
