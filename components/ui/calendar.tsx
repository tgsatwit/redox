"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { format, isToday, isWithinInterval, add, set, parse, getDay } from "date-fns"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = {
  className?: string
  classNames?: Record<string, string>
  selected?: Date | Date[]
  onSelect?: (date: Date | undefined) => void
  month?: Date
  onMonthChange?: (month: Date) => void
  disabled?: { from?: Date; to?: Date } | ((date: Date) => boolean)
  showOutsideDays?: boolean
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
  mode?: "single" | "multiple" | "range"
  numberOfMonths?: number
  fromDate?: Date
  toDate?: Date
  defaultMonth?: Date
  captionLayout?: "dropdown" | "buttons" | "dropdown-buttons"
  [key: string]: any
}

function Calendar({
  className,
  classNames,
  selected,
  onSelect,
  month = new Date(),
  onMonthChange,
  showOutsideDays = true,
  weekStartsOn = 0,
  ...props
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState(month)
  
  // Handle month navigation
  const handlePreviousMonth = () => {
    const previousMonth = add(currentMonth, { months: -1 })
    setCurrentMonth(previousMonth)
    onMonthChange?.(previousMonth)
  }
  
  const handleNextMonth = () => {
    const nextMonth = add(currentMonth, { months: 1 })
    setCurrentMonth(nextMonth)
    onMonthChange?.(nextMonth)
  }
  
  // Generate days of the week
  const weekdays = React.useMemo(() => {
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    // Reorder days based on weekStartsOn
    return [...daysOfWeek.slice(weekStartsOn), ...daysOfWeek.slice(0, weekStartsOn)]
  }, [weekStartsOn])
  
  // Generate days of the month
  const days = React.useMemo(() => {
    const firstDayOfMonth = set(currentMonth, { date: 1 })
    const lastDayOfMonth = set(currentMonth, { date: 0, month: currentMonth.getMonth() + 1 })
    const daysInMonth = lastDayOfMonth.getDate()
    
    // Calculate days from previous month to show
    const firstDayOfWeek = getDay(firstDayOfMonth)
    const prevMonthDays = (firstDayOfWeek - weekStartsOn + 7) % 7
    
    // Calculate total days to show (including days from prev/next month)
    const totalDays = prevMonthDays + daysInMonth
    const totalWeeks = Math.ceil(totalDays / 7)
    
    const days = []
    let dayCounter = 1 - prevMonthDays
    
    for (let i = 0; i < totalWeeks * 7; i++) {
      const date = add(firstDayOfMonth, { days: dayCounter - 1 })
      const isCurrentMonth = date.getMonth() === currentMonth.getMonth()
      
      days.push({
        date,
        dayOfMonth: date.getDate(),
        isCurrentMonth,
        isToday: isToday(date),
        isSelected: selected instanceof Date && selected.getTime() === date.getTime(),
      })
      
      dayCounter++
    }
    
    return days
  }, [currentMonth, selected, weekStartsOn])
  
  const handleSelectDate = (date: Date) => {
    onSelect?.(date)
  }
  
  return (
    <div className={cn("p-3", className)}>
      <div className="flex justify-center pt-1 relative items-center">
        <div className="text-sm font-medium">
          {format(currentMonth, 'MMMM yyyy')}
        </div>
        <div className="space-x-1 flex items-center">
          <button
            onClick={handlePreviousMonth}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={handleNextMonth}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1"
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      
      <div className="w-full mt-4">
        <div className="flex">
          {weekdays.map((day, i) => (
            <div 
              key={i} 
              className="text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] text-center"
            >
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 mt-2">
          {days.map((day, i) => (
            <div
              key={i}
              className={cn(
                "h-9 w-9 text-center text-sm p-0 relative",
                !day.isCurrentMonth && !showOutsideDays && "invisible",
                !day.isCurrentMonth && showOutsideDays && "text-muted-foreground opacity-50"
              )}
            >
              <button
                onClick={() => handleSelectDate(day.date)}
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "h-9 w-9 p-0 font-normal",
                  day.isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  day.isToday && !day.isSelected && "bg-accent text-accent-foreground"
                )}
              >
                {day.dayOfMonth}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

Calendar.displayName = "Calendar"

export { Calendar }
