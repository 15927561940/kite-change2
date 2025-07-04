import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  RowSelectionState,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { Box, Database, Plus, RotateCcw, Search, XCircle, CheckSquare, Square, MinusSquare, Check } from 'lucide-react'

import { ResourceType } from '@/types/api'
import { useResources } from '@/lib/api'
import { debounce } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { NamespaceSelector } from './selector/namespace-selector'

export interface ResourceTableProps<T> {
  resourceName: string
  resourceType?: ResourceType // Optional, used for fetching resources
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[]
  clusterScope?: boolean // If true, don't show namespace selector
  searchQueryFilter?: (item: T, query: string) => boolean // Custom filter function
  showCreateButton?: boolean // If true, show create button
  onCreateClick?: () => void // Callback for create button click
  customActions?: React.ReactNode // Custom action buttons
  enableRowSelection?: boolean // If true, enable row selection with checkboxes
  onBatchAction?: (selectedRows: T[], action: string) => void // Callback for batch actions
  batchActions?: Array<{ label: string; action: string; variant?: 'default' | 'destructive' }> // Available batch actions
}

export function ResourceTable<T>({
  resourceName,
  resourceType,
  columns,
  clusterScope = false,
  searchQueryFilter,
  showCreateButton = false,
  onCreateClick,
  customActions,
  enableRowSelection = false,
  onBatchAction,
  batchActions = [],
}: ResourceTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('')
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })

  const [selectedNamespace, setSelectedNamespace] = useState<
    string | undefined
  >()
  const { isLoading, data, isError, error, refetch } = useResources(
    resourceType ?? (resourceName.toLowerCase() as ResourceType),
    selectedNamespace,
    {
      refreshInterval: 5000, // Refresh every 5 seconds
    }
  )

  // Set initial namespace when namespaces are loaded
  useEffect(() => {
    if (!clusterScope && !selectedNamespace && setSelectedNamespace) {
      const storedNamespace = localStorage.getItem('selectedNamespace')
      if (storedNamespace) {
        setSelectedNamespace(storedNamespace)
      } else {
        setSelectedNamespace('default') // Set a default namespace if none is stored
      }
    }
  }, [clusterScope, selectedNamespace, setSelectedNamespace])

  // Initialize our debounced search function just once
  const debouncedSetSearch = useMemo(
    () =>
      debounce((value: string) => {
        setDebouncedSearchQuery(value)
      }, 300),
    []
  )

  // Update debounced search query when input changes
  useEffect(() => {
    debouncedSetSearch(searchQuery)
  }, [searchQuery, debouncedSetSearch])

  // Reset pagination when filters change
  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
  }, [columnFilters, debouncedSearchQuery])

  // Handle namespace change
  const handleNamespaceChange = useCallback(
    (value: string) => {
      if (setSelectedNamespace) {
        localStorage.setItem('selectedNamespace', value)
        setSelectedNamespace(value)
        // Reset pagination and search when changing namespace
        setPagination({ pageIndex: 0, pageSize: pagination.pageSize })
        setSearchQuery('')
        // Reset debounced search immediately to prevent filter mismatch
        setDebouncedSearchQuery('')
      }
    },
    [setSelectedNamespace, pagination.pageSize]
  )

  // Handle toggle selection (select all if none selected, deselect all if any selected)
  const handleToggleSelection = useCallback(() => {
    const selectedRowsCount = Object.keys(rowSelection).length
    console.log('handleToggleSelection called, current selectedRowsCount:', selectedRowsCount)
    
    if (selectedRowsCount === 0) {
      // Select all rows on current page (we'll update this with table reference later)
      const newSelection: RowSelectionState = {}
      // For now, use a simple approach based on pagination
      const startIndex = pagination.pageIndex * pagination.pageSize
      const endIndex = Math.min(startIndex + pagination.pageSize, (data as T[] || []).length)
      
      for (let i = startIndex; i < endIndex; i++) {
        newSelection[i.toString()] = true
      }
      console.log('Selecting rows from', startIndex, 'to', endIndex - 1)
      setRowSelection(newSelection)
    } else {
      // Deselect all
      console.log('Deselecting all rows')
      setRowSelection({})
    }
  }, [rowSelection, pagination, data])

  // Get selection state for icons
  const getSelectionState = useCallback(() => {
    const selectedRowsCount = Object.keys(rowSelection).length
    // Use current page size for comparison
    const currentPageSize = Math.min(pagination.pageSize, (data as T[] || []).length - pagination.pageIndex * pagination.pageSize)
    
    if (selectedRowsCount === 0) {
      return 'none'
    } else if (selectedRowsCount === currentPageSize) {
      return 'all'
    } else {
      return 'some'
    }
  }, [rowSelection, pagination, data])

  // Add namespace column when showing all namespaces and selection column when enabled
  const enhancedColumns: ColumnDef<T, any>[] = useMemo(() => {
    let newColumns = [...columns]

    // Add selection column if enabled
    if (enableRowSelection) {
      const selectionColumn: ColumnDef<T, any> = {
        id: 'select',
        header: () => (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleSelection}
            className="h-6 w-6 p-0"
          >
            {getSelectionState() === 'all' ? (
              <Check className="w-4 h-4" />
            ) : getSelectionState() === 'some' ? (
              <MinusSquare className="w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      }
      
      // Insert selection column at the beginning
      newColumns = [selectionColumn, ...newColumns]
    }

    // Only add namespace column if not cluster scope, showing all namespaces,
    // and there isn't already a namespace column in the provided columns
    if (!clusterScope && selectedNamespace === '_all') {
      // Check if namespace column already exists in the provided columns
      const hasNamespaceColumn = columns.some((col) => {
        // Check if the column accesses namespace data
        if ('accessorKey' in col && col.accessorKey === 'metadata.namespace') {
          return true
        }
        if ('accessorFn' in col && col.id === 'namespace') {
          return true
        }
        return false
      })

      // Only add namespace column if it doesn't already exist
      if (!hasNamespaceColumn) {
        const namespaceColumn: ColumnDef<T, any> = {
          id: 'namespace',
          header: 'Namespace',
          accessorFn: (row: T) => {
            // Try to get namespace from metadata.namespace
            const metadata = (row as { metadata?: { namespace?: string } })
              ?.metadata
            return metadata?.namespace || '-'
          },
          cell: ({ getValue }) => (
            <Badge variant="outline" className="ml-2">
              {getValue() as string}
            </Badge>
          ),
        }

        // Insert namespace column after the selection column (if exists) and first column (typically name)
        const insertIndex = enableRowSelection ? 2 : 1
        newColumns.splice(insertIndex, 0, namespaceColumn)
      }
    }
    return newColumns
  }, [columns, clusterScope, selectedNamespace, enableRowSelection, handleToggleSelection, getSelectionState])

  // Memoize data to prevent unnecessary re-renders
  const memoizedData = useMemo(() => (data || []) as T[], [data])

  // Create table instance using TanStack Table
  const table = useReactTable<T>({
    data: memoizedData,
    columns: enhancedColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: enableRowSelection,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      globalFilter: debouncedSearchQuery, // Use debounced query for filtering
      pagination,
    },
    onPaginationChange: setPagination,
    // Let TanStack Table handle pagination automatically based on filtered data
    manualPagination: false,
    // Improve filtering performance and consistency
    globalFilterFn: (row, _columnId, value) => {
      if (searchQueryFilter) {
        return searchQueryFilter(row.original as T, String(value).toLowerCase())
      }
      const searchValue = String(value).toLowerCase()

      // Search across all visible columns
      return row.getVisibleCells().some((cell) => {
        const cellValue = String(cell.getValue() || '').toLowerCase()
        return cellValue.includes(searchValue)
      })
    },
    // Add this to prevent unnecessary pagination resets
    autoResetPageIndex: false,
  })

  // Calculate total and filtered row counts
  const totalRowCount = useMemo(
    () => (data as T[] | undefined)?.length || 0,
    [data]
  )
  const filteredRowCount = useMemo(() => {
    if (!data || (data as T[]).length === 0) return 0
    // Force re-computation when filters change
    void debouncedSearchQuery // Ensure dependency is used
    void columnFilters // Ensure dependency is used
    return table.getFilteredRowModel().rows.length
  }, [table, data, debouncedSearchQuery, columnFilters])

  // Check if there are active filters
  const hasActiveFilters = useMemo(() => {
    return Boolean(debouncedSearchQuery) || columnFilters.length > 0
  }, [debouncedSearchQuery, columnFilters])

  // Get selected rows data
  const selectedRows = useMemo(() => {
    return table.getSelectedRowModel().rows.map(row => row.original)
  }, [table])

  // Get selected rows count for immediate UI updates
  const selectedRowsCount = useMemo(() => {
    return Object.keys(rowSelection).length
  }, [rowSelection])

  // Handle batch action
  const handleBatchAction = useCallback((action: string) => {
    // If selectedRows is empty but selectedRowsCount > 0, manually construct selectedRows
    let actualSelectedRows = selectedRows
    if (selectedRowsCount > 0 && selectedRows.length === 0) {
      const allData = (data as T[]) || []
      const selectedIndices = Object.keys(rowSelection).map(key => parseInt(key))
      actualSelectedRows = selectedIndices.map(index => allData[index]).filter(Boolean)
    }
    
    if (onBatchAction && selectedRowsCount > 0 && actualSelectedRows.length > 0) {
      console.log(`Executing batch ${action} for ${actualSelectedRows.length} items`)
      onBatchAction(actualSelectedRows, action)
      // Clear selection after action
      setRowSelection({})
    } else {
      console.warn('Cannot execute batch action - insufficient selection or missing handler')
    }
  }, [onBatchAction, selectedRows, selectedRowsCount, rowSelection, data])

  // Render empty state based on condition
  const renderEmptyState = () => {
    // Only show loading state if there's no existing data
    if (isLoading && (!data || (data as T[]).length === 0)) {
      return (
        <div className="h-72 flex flex-col items-center justify-center">
          <div className="mb-4 bg-muted/30 p-6 rounded-full">
            <Database className="h-12 w-12 text-muted-foreground animate-pulse" />
          </div>
          <h3 className="text-lg font-medium mb-1">
            Loading {resourceName.toLowerCase()}...
          </h3>
          <p className="text-muted-foreground">
            Retrieving data
            {!clusterScope && selectedNamespace
              ? ` from ${selectedNamespace === '_all' ? 'All Namespaces' : `namespace ${selectedNamespace}`}`
              : ''}
          </p>
        </div>
      )
    }

    if (isError) {
      return (
        <div className="h-72 flex flex-col items-center justify-center">
          <div className="mb-4 text-red-500">
            <XCircle className="h-16 w-16" />
          </div>
          <h3 className="text-lg font-medium text-red-500 mb-1">
            Error loading {resourceName.toLowerCase()}
          </h3>
          <p className="text-muted-foreground mb-4">
            {(error as Error).message}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      )
    }

    if (data && (data as T[]).length === 0) {
      return (
        <div className="h-72 flex flex-col items-center justify-center">
          <div className="mb-4 bg-muted/30 p-6 rounded-full">
            <Box className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">
            No {resourceName.toLowerCase()} found
          </h3>
          <p className="text-muted-foreground">
            {debouncedSearchQuery
              ? `No results match your search query: "${debouncedSearchQuery}"`
              : clusterScope
                ? `There are no ${resourceName.toLowerCase()} found`
                : `There are no ${resourceName.toLowerCase()} in the ${selectedNamespace} namespace`}
          </p>
          {debouncedSearchQuery && (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setSearchQuery('')}
            >
              Clear Search
            </Button>
          )}
        </div>
      )
    }

    return null
  }

  // Only render visible rows in the viewport for better performance
  const renderRows = () => {
    // Get the current rows from the pagination model
    const rows = table.getRowModel().rows

    if (rows.length === 0) {
      return (
        <TableRow>
          <TableCell
            colSpan={enhancedColumns.length}
            className="h-24 text-center"
          >
            No results.
          </TableCell>
        </TableRow>
      )
    }

    return rows.map((row) => (
      <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
        {row.getVisibleCells().map((cell) => {
          // 获取列的对齐方式
          const align = (cell.column.columnDef.meta as any)?.align || 'center'
          const alignClass = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center'
          
          return (
            <TableCell key={cell.id} className={`align-middle ${alignClass}`}>
              {cell.column.columnDef.cell
                ? flexRender(cell.column.columnDef.cell, cell.getContext())
                : String(cell.getValue() || '-')}
            </TableCell>
          )
        })}
      </TableRow>
    ))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold capitalize">{resourceName}</h1>
          {!clusterScope &&
            selectedNamespace &&
            selectedNamespace !== '_all' && (
              <div className="text-muted-foreground flex items-center mt-1">
                <span>Namespace:</span>
                <Badge variant="outline" className="ml-2 ">
                  {selectedNamespace}
                </Badge>
              </div>
            )}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            {!clusterScope && (
              <NamespaceSelector
                selectedNamespace={selectedNamespace}
                handleNamespaceChange={handleNamespaceChange}
                showAll={true}
              />
            )}
            {/* Column Filters */}
            {table
              .getAllColumns()
              .filter((column) => {
                const columnDef = column.columnDef as ColumnDef<T> & {
                  enableColumnFilter?: boolean
                }
                return columnDef.enableColumnFilter && column.getCanFilter()
              })
              .map((column) => {
                const columnDef = column.columnDef as ColumnDef<T> & {
                  enableColumnFilter?: boolean
                }
                const uniqueValues = column.getFacetedUniqueValues()
                const filterValue = column.getFilterValue() as string

                return (
                  <Select
                    key={column.id}
                    value={filterValue || ''}
                    onValueChange={(value) =>
                      column.setFilterValue(value === 'all' ? '' : value)
                    }
                  >
                    <SelectTrigger className="min-w-32">
                      <SelectValue
                        placeholder={`Filter ${typeof columnDef.header === 'string' ? columnDef.header : 'Column'}`}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        All{' '}
                        {typeof columnDef.header === 'string'
                          ? columnDef.header
                          : 'Values'}
                      </SelectItem>
                      {Array.from(uniqueValues.keys())
                        .sort()
                        .map((value) => (
                          <SelectItem key={String(value)} value={String(value)}>
                            {String(value)} ({uniqueValues.get(value)})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )
              })}
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={`Search ${resourceName.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 w-full sm:w-[200px] md:w-[300px]"
              />
            </div>
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchQuery('')}
                className="h-9 w-9"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Quick Selection Indicator */}
          {enableRowSelection && selectedRowsCount > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 rounded-md border border-blue-200">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleSelection}
                className="h-7 px-2"
                title={getSelectionState() === 'all' ? '取消全选' : '全选当前页'}
              >
                {getSelectionState() === 'all' && <CheckSquare className="w-4 h-4 text-blue-600" />}
                {getSelectionState() === 'some' && <MinusSquare className="w-4 h-4 text-blue-600" />}
              </Button>
              <span className="text-xs text-blue-700 font-medium">
                已选 {selectedRowsCount}
              </span>
            </div>
          )}

          {showCreateButton && onCreateClick && (
            <Button onClick={onCreateClick} className="gap-1">
              <Plus className="h-2 w-2" />
              New
            </Button>
          )}
          
          {customActions}
        </div>
      </div>

      {/* Batch Selection Toolbar */}
      {enableRowSelection && data && (data as T[]).length > 0 && (
        <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-center gap-4">
            {/* 全选当前页按钮在前 */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleSelection}
                className="h-8"
              >
                {getSelectionState() === 'all' ? (
                  <Check className="w-4 h-4 mr-1" />
                ) : (
                  <Square className="w-4 h-4 mr-1" />
                )}
                全选当前页{selectedRowsCount > 0 ? ` (${selectedRowsCount})` : ''}
              </Button>
            </div>
            
            {/* 批量重启按钮在后 */}
            {batchActions.length > 0 && (
              <div className="flex items-center gap-2">
                {batchActions.map((action) => (
                  <Button
                    key={action.action}
                    variant={action.variant || 'default'}
                    size="sm"
                    onClick={() => handleBatchAction(action.action)}
                    disabled={selectedRowsCount === 0}
                    className={`h-8 ${
                      action.action === 'restart' 
                        ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200 disabled:bg-gray-200 disabled:text-gray-400' 
                        : ''
                    }`}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
            
            {selectedRowsCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 rounded-md">
                <span className="text-sm font-medium text-blue-800">
                  已选择 {selectedRowsCount} 项
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading indicator for refetch */}
      {isLoading && data && (data as T[]).length > 0 && (
        <div className="flex items-center justify-center py-2 bg-muted/20 rounded-md">
          <Database className="h-4 w-4 text-muted-foreground animate-pulse mr-2" />
          <span className="text-sm text-muted-foreground">
            Updating {resourceName.toLowerCase()}...
          </span>
        </div>
      )}

      {/* Table card */}
      <div className="overflow-hidden rounded-lg border">
        <div
          className={`rounded-md transition-opacity duration-200 ${
            isLoading && data && (data as T[]).length > 0
              ? 'opacity-75'
              : 'opacity-100'
          }`}
        >
          {renderEmptyState() || (
            <>
              <Table>
                <TableHeader className="bg-muted sticky top-0 z-10">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        // 获取表头的对齐方式
                        const align = (header.column.columnDef.meta as any)?.align || 'center'
                        const alignClass = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center'
                        
                        return (
                        <TableHead key={header.id} className={alignClass}>
                          {header.isPlaceholder ? null : header.column.getCanSort() ? (
                            <Button
                              variant="ghost"
                              onClick={header.column.getToggleSortingHandler()}
                              className={
                                header.column.getIsSorted()
                                  ? 'text-primary'
                                  : ''
                              }
                            >
                              {
                                header.column.columnDef
                                  .header as React.ReactNode
                              }
                              {header.column.getIsSorted() && (
                                <span className="ml-2">
                                  {header.column.getIsSorted() === 'asc'
                                    ? '↑'
                                    : '↓'}
                                </span>
                              )}
                            </Button>
                          ) : (
                            (header.column.columnDef.header as React.ReactNode)
                          )}
                        </TableHead>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody className="**:data-[slot=table-cell]:first:w-8">
                  {renderRows()}
                </TableBody>
              </Table>
            </>
          )}
        </div>
      </div>

      {/* Pagination with memoized calculations */}
      {data && (data as T[]).length > 0 && (
        <div className="flex items-center justify-between px-4">
          <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
            {hasActiveFilters ? (
              <>
                Showing {filteredRowCount} of {totalRowCount} row(s)
                {debouncedSearchQuery && (
                  <span className="ml-1">
                    (filtered by "{debouncedSearchQuery}")
                  </span>
                )}
              </>
            ) : (
              `${totalRowCount} row(s) total.`
            )}
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">每页:</span>
                <Select
                  value={pagination.pageSize.toString()}
                  onValueChange={(value) => {
                    setPagination({
                      pageIndex: 0,
                      pageSize: Number(value),
                    })
                  }}
                >
                  <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent side="top">
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-fit items-center justify-center text-sm font-medium">
                第 {pagination.pageIndex + 1} 页，共 {table.getPageCount() || 1} 页
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to previous page</span>←
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to next page</span>→
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}