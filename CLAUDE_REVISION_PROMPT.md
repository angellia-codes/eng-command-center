# NGI Engineering Command Center - Revision Requirements

## Project Overview

Revise and improve the existing NGI Engineering Command Center web application built with:

* Frontend: HTML, CSS, JavaScript (Vanilla JS)
* Backend: Supabase
* Deployment: Netlify
* Notifications: Fonnte WhatsApp API
* Storage: Supabase Storage

Maintain the existing coding style, architecture, and module structure wherever possible.

---

# 1. Dashboard Module Redesign

Create a modern Engineering Dashboard containing:

## KPI Cards

Display:

* Total Work Orders (Current Month)
* Completed Work Orders (Current Month)
* Active Work Orders
* Open Purchase Requests
* Overdue Work Orders
* Asset Count

## Monthly Work Orders

Display:

* Monthly WO statistics
* Completion percentage
* WO trend chart

## Active Work Orders

Display:

* All Work Orders with status:

  * Pending
  * In Progress
  * Waiting for Parts

Include:

* WO Number
* Outlet
* Priority
* Assigned Technician
* Target Completion Date
* Work Order Photo Thumbnail

## Engineering Daily Update Summary

Display:

* Latest Daily Engineering Updates
* Outlet
* Date
* Progress Summary
* Carryover Projects

## Purchase Request Tracker

Display:

* PR Number
* Item
* Status
* Outlet
* Requested By
* Estimated Cost

---

# 2. Daily Engineering Update Module

Create a new module:

## Daily Engineering Update Form

Fields:

* Outlet (Dropdown)
* Date
* Progress Update
* Issues Encountered
* Tomorrow Plan
* Photo Attachment

Requirements:

* Remove "Pending Project" field
* Remove "Carryover Project" field from form

## Automation

If a project is not marked completed from previous submissions:

* Automatically classify as Carryover Project
* Display Carryover Projects on Dashboard
* No manual carryover entry required

## Dashboard Integration

Dashboard must automatically show:

* Today's Updates
* Outstanding Carryover Projects
* Progress by Outlet

---

# 3. Registry Asset Module Enhancement

## Asset Form Enhancement

Add:

* Camera Upload Button
* Gallery Upload Button

Allow:

* Multiple Photos
* Mobile Camera Capture

Store photos in:

* Supabase Storage

## Asset List Enhancement

Display:

* Asset Photo Thumbnail
* Asset Code
* Asset Name
* Category
* Outlet
* Status

Click thumbnail:

* Open image preview modal

---

# 4. Remove Engineering Request Module

Completely remove:

* Engineering Requests table
* Engineering Request forms
* Engineering Request dashboard cards
* Engineering Request menu navigation
* Engineering Request realtime subscriptions
* Engineering Request database references

Clean all unused code and imports.

---

# 5. Work Order Photo Visibility

Current issue:

Photos uploaded during Work Order creation are not visible in Active Work Order list.

Required:

Display photo thumbnails inside:

* Active Work Orders list
* Work Order table
* Dashboard Active Work Orders section

Features:

* Thumbnail preview
* Click to enlarge
* Mobile responsive

---

# 6. Purchase Request Module Enhancement

## Purchase Request Form

Add:

### Auto PR Number

Generate automatically:

PR-0001
PR-0002
PR-0003

Display PR Number at top of form.

---

### Photo Attachment

Add:

* Camera Button
* Gallery Button

Store photos in Supabase Storage.

---

### Purchase Request List

Display:

* Photo Thumbnail
* PR Number
* Item Name
* Qty
* Outlet
* Status
* Cost

Click photo:

* Open image preview modal

---

### PDF Export

Add button:

Export Purchase Request PDF

PDF should include:

* PR Number
* Outlet
* Requestor
* Item Details
* Cost
* Notes
* Attached Photo

Generate printable A4 layout.

---

### WhatsApp Notification

When Purchase Request is submitted:

Automatically send WhatsApp notification using Fonnte.

Notification should include:

* PR Number
* Outlet
* Item
* Quantity
* Estimated Cost
* Requestor

Use existing Netlify Function notification architecture.

---

# 7. Inventory & Spare Parts Module

## Inventory Synchronization

Current issue:

Added spare parts do not appear in Inventory list.

Required:

Every spare part added must automatically appear in Inventory.

---

## Inventory List

Display:

* Part Code
* Part Name
* Category
* Quantity
* Min Stock
* Location

---

## Low Stock Alert

When:

Current Stock <= Minimum Stock

Trigger:

* Dashboard notification
* Inventory badge warning

Display:

LOW STOCK

Highlight affected items.

---

# 8. Engineering SOP Module

Create new menu:

Engineering SOP

---

## SOP Repository

Store SOP references using:

Google Drive links

Fields:

* SOP Title
* Category
* Description
* Google Drive URL

---

## SOP List

Display:

* SOP Title
* Category
* Last Updated

---

## Open SOP

Click SOP:

Open corresponding Google Drive document in new tab.

---

# Technical Requirements

## Supabase

Create and update required tables:

* daily_engineering_updates
* asset_photos
* purchase_request_photos
* engineering_sop

Add necessary relationships.

---

## Realtime

Maintain realtime updates for:

* Work Orders
* Purchase Requests
* Inventory
* Daily Engineering Updates

---

## Mobile First

All modules must work properly on:

* Android
* iPhone
* Tablet
* Desktop

Support:

* Camera Capture
* Gallery Upload

---

## Code Quality

Requirements:

* Remove dead code
* Remove unused imports
* Maintain modular architecture
* Follow existing coding standards
* Preserve current functionality unless explicitly replaced

---

# Deliverables

Provide:

1. Database schema changes (SQL)
2. New Supabase Storage bucket requirements
3. Updated JavaScript modules
4. Updated HTML components
5. Updated CSS styles
6. Migration strategy
7. Testing checklist
8. Bug fixes discovered during implementation

Implement all revisions completely and ensure the application remains production-ready.