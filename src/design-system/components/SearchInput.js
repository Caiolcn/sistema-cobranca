import React, { forwardRef } from 'react'
import Input from './Input'

/* ============================================================
   SearchInput — DS Mensalli
   Composição fina sobre Input. Equivale a:
     <Input icon="mdi:magnify" clearable type="search" />

   Uso:
     <SearchInput
       value={busca}
       onChange={e => setBusca(e.target.value)}
       placeholder="Buscar clientes..."
     />
   ============================================================ */

const SearchInput = forwardRef(function SearchInput({
  placeholder = 'Buscar...',
  ...rest
}, ref) {
  return (
    <Input
      ref={ref}
      type="search"
      icon="mdi:magnify"
      clearable
      placeholder={placeholder}
      {...rest}
    />
  )
})

export default SearchInput
