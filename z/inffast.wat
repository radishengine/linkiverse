(module

  (import "memory" "main" (memory 0))

  ;; code as i32: VVVVBBPP
  ;; VVVV = val
  ;; BB = bits
  ;; PP = op

  (; https://github.com/madler/zlib/blob/v1.2.11/zlib.h#L86 ;)
  (global $z_stream.&next_in   i32 i32.const 0)
  (global $z_stream.&avail_in  i32 i32.const 4)
  (global $z_stream.&total_in  i32 i32.const 8)
  (global $z_stream.&next_out  i32 i32.const 12)
  (global $z_stream.&avail_out i32 i32.const 16)
  (global $z_stream.&total_out i32 i32.const 20)
  (global $z_stream.&msg       i32 i32.const 24)
  (global $z_stream.&state     i32 i32.const 28)
  (global $z_stream.&zalloc    i32 i32.const 32)
  (global $z_stream.&zfree     i32 i32.const 36)
  (global $z_stream.&opaque    i32 i32.const 40)
  (global $z_stream.&data_type i32 i32.const 44)
  (global $z_stream.&adler     i32 i32.const 48)
  (global $z_stream.&reserved  i32 i32.const 52)
  (global $#z_stream           i32 i32.const 56)
  
  ;; stream:
  ;;  offset=0 next_in
  ;;  offset=4 avail_in
  ;;  offset=8 total_in
  ;;  offset=12 next_out
  ;;  offset=16 avail_out
  ;;  offset=20 total_out
  ;;  offset=24 msg
  ;;  offset=28 state

  ;; state: (note: recent inflate.h has added strm reference as first field)
  ;;  offset=0  strm
  ;;  offset=4  mode
  ;;  offset=8  last
  ;;  offset=12  wrap
  ;;  offset=16 havedict
  ;;  offset=20 flags
  ;;  offset=24 dmax
  ;;  offset=28 check
  ;;  offset=32 total
  ;;  offset=36 head
  ;;  offset=40 wbits
  ;;  offset=44 wsize
  ;;  offset=48 whave
  ;;  offset=52 wnext
  ;;  offset=56 window
  ;;  offset=60 hold
  ;;  offset=64 bits
  ;;  offset=68 length
  ;;  offset=72 offset
  ;;  offset=76 extra
  ;;  offset=80 lencode
  ;;  offset=84 distcode
  ;;  offset=88 lenbits
  ;;  offset=92 distbits
  ;;  offset=96 ncode
  ;;  offset=100 nlen
  ;;  offset=104 ndist
  ;;  offset=108 have
  ;;  offset=112 next
  ;;  offset=116 lens[320]
  ;;  offset=756 work[288]
  ;;  offset=1332 codes[1444]
  ;;  offset=7108 sane
  ;;  offset=7112 back
  ;;  offset=7116 was
  ;; length:7120
  
  (; https://github.com/madler/zlib/blob/v1.2.11/inffast.c#L50 ;)
  (func $inflate_fast
      (param $strm i32)
      (param $start i32) ;; inflate()'s starting value for strm->avail_out
    (local $state  i32)
    (local $in     i32) ;; local strm->next_in
    (local $last   i32) ;; have enough input while $in < $last
    (local $out    i32) ;; local strm->next_out
    (local $beg    i32) ;; inflate()'s initial strm->next_out
    (local $end    i32) ;; while $out < $end, enough space available
    (local $wsize  i32) ;; window size or zero if not using window
    (local $whave  i32) ;; valid bytes in the window
    (local $wnext  i32) ;; window write index
    (local $window i32) ;; allocated sliding window, if wsize != 0
    (local $hold   i32) ;; local strm->hold
    (local $bits   i32) ;; local strm->bits
    (local $lcode  i32) ;; local strm->lencode
    (local $dcode  i32) ;; local strm->distcode
    (local $lmask  i32) ;; mask for first level of length codes
    (local $dmask  i32) ;; mask for first level of distance codes
    (local $here   i32) ;; retrieved table entry
    (local $op     i32) ;; code bits, operation, extra bits, or window position, window bytes to copy
    (local $len    i32) ;; match length, unused bytes
    (local $dist   i32) ;; match distance
    (local $from   i32) ;; where to copy match from
    
    ;; copy state to local variables
    (set_local $state   (i32.load (i32.add (get_local $strm) (get_global $z_stream.&state))))
    (set_local $in      (i32.load (i32.add (get_local $strm) (get_global $z_stream.&next_in))))
    (set_local $last
      (i32.add
        (get_local $in)
        (i32.sub
                        (i32.load (i32.add (get_local $strm) (get_global $z_stream.&avail_in)))
                        (i32.const 5)
        )
      )
    )
    (set_local $out     (i32.load (i32.add (get_local $strm) (get_global $z_stream.&next_out))))
    (set_local $beg
      (i32.sub
        (get_local $out)
        (i32.sub
                        (get_local $start)
                        (i32.load (i32.add (get_local $strm) (get_global $z_stream.&avail_out)))
        )
      )
    )
    (set_local $end
      (i32.add
        (get_local $out)
        (i32.sub
                        (i32.load (i32.add (get_local $strm) (get_global $z_stream.&avail_in)))
                        (i32.const 257)
        )
      )
    )
    (set_local $wsize  (i32.load (; wsize ;)     offset=44 (get_local $state)))
    (set_local $whave  (i32.load (; whave ;)     offset=48 (get_local $state)))
    (set_local $wnext  (i32.load (; wnext ;)     offset=52 (get_local $state)))
    (set_local $window (i32.load (; window ;)    offset=56 (get_local $state)))
    (set_local $hold   (i32.load (; hold ;)      offset=60 (get_local $state)))
    (set_local $bits   (i32.load (; bits ;)      offset=64 (get_local $state)))
    (set_local $lcode  (i32.load (; lencode ;)   offset=80 (get_local $state)))
    (set_local $dcode  (i32.load (; distcode ;)  offset=84 (get_local $state)))
    (set_local $lmask
      (i32.sub
        (i32.shl
                        (i32.const 1)
                        (i32.load (; lenbits ;) offset=88 (get_local $state))
        )
        (i32.const 1)
      )
    )
    (set_local $dmask
      (i32.sub
        (i32.shl
                        (i32.const 1)
                        (i32.load (; distbits ;) offset=92 (get_local $state))
        )
        (i32.const 1)
      )
    )
    ;; decode literals and length/distances until end-of-block or not enough
    ;; input data or output space
    
    block $break
      loop $top
        block $do
          (if (i32.lt_u (get_local $bits) (i32.const 15)) (then
            (set_local $hold (i32.add (get_local $hold) (i32.shl (i32.load8_u (get_local $in)) (get_local $bits))))
            (set_local $in   (i32.add (get_local $in)   (i32.const 1)))
            (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
            (set_local $hold (i32.add (get_local $hold) (i32.shl (i32.load8_u (get_local $in)) (get_local $bits))))
            (set_local $in   (i32.add (get_local $in)   (i32.const 1)))
            (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
          ))
          ;; $here = $lcode[$hold & $lmask] (codes are 32-bit)
          (set_local $here
            (i32.load
              (i32.add
                (get_local $lcode)
                (i32.shl
                  (i32.and (get_local $hold) (get_local $lmask))
                  (i32.const 2)
                )
              )
            )
          )
          loop $dolen
            ;; $op = $here.bits (2nd-lowest byte)
            (set_local $op
              (i32.and
                (i32.shr_u (get_local $here) (i32.const 8))
                (i32.const 255)
              )
            )
            (set_local $hold (i32.shr_u (get_local $hold) (get_local $op)))
            (set_local $bits (i32.sub   (get_local $bits) (get_local $op)))
            
            ;; $op = $here.op (low byte)
            (set_local $op
              (i32.and
                (get_local $here)
                (i32.const 255)
              )
            )
            (if (i32.eqz (get_local $op)) (then
              ;; literal
              ;; Tracevv((stderr, here.val >= 0x20 && here.val < 0x7f ?
              ;;   "inflate:         literal '%c'\n" :
              ;;   "inflate:         literal 0x%02x\n", here.val));
              
              ;; *out = (unsigned char)($here.val) (low byte of high word)
              (i32.store8 (get_local $out)
                (i32.and
                  (i32.shr_u (get_local $here) (i32.const 16))
                  (i32.const 255)
                )
              )
              ;; out++
              (set_local $out (i32.add (get_local $out) (i32.const 1)))
              (br $do)
            ))
            
            (if (i32.and (get_local $op) (i32.const 16)) (then
              ;; length base
              (set_local $len (i32.shr_u (get_local $here) (i32.const 16)))
              (set_local $op  (i32.and   (get_local $op)   (i32.const 15))) ;; number of extra bits
              (if (get_local $op) (then
                (if (i32.lt_u (get_local $bits) (get_local $op)) (then
                  (set_local $hold
                    (i32.add
                      (get_local $hold)
                      (i32.shl
                        (i32.load8_u (get_local $in))
                        (get_local $bits)
                      )
                    )
                  )
                  (set_local   $in (i32.add (get_local   $in) (i32.const 1)))
                  (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                ))
                (set_local $len
                  (i32.add
                    (get_local $len)
                    (i32.and
                      (get_local $hold)
                      (i32.sub
                        (i32.shl
                          (i32.const 1)
                          (get_local $op)
                        )
                        (i32.const 1)
                      )
                    )
                  )
                )
              ))
              ;; Tracevv((stderr, "inflate:         length %u\n", len));
              (if (i32.lt_u (get_local $bits) (i32.const 15)) (then
                (set_local $hold (i32.add (get_local $hold) (i32.shl (i32.load8_u (get_local $in)) (get_local $bits))))
                (set_local $in   (i32.add (get_local $in)   (i32.const 1)))
                (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                (set_local $hold (i32.add (get_local $hold) (i32.shl (i32.load8_u (get_local $in)) (get_local $bits))))
                (set_local $in   (i32.add (get_local $in)   (i32.const 1)))
                (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
              ))
              ;; $here = $dcode[$hold & $dmask]
              (set_local $here
                (i32.load
                  (i32.add
                    (get_local $dcode)
                    (i32.shl
                      (i32.and (get_local $hold) (get_local $dmask))
                      (i32.const 2)
                    )
                  )
                )
              )
              loop $dodist
                ;; $op = $here.bits
                (set_local $op
                  (i32.and
                    (i32.shr_u (get_local $here) (i32.const 8))
                    (i32.const 255)
                  )
                )
                (set_local $hold (i32.shr_u (get_local $hold) (get_local $op)))
                (set_local $bits (i32.sub   (get_local $bits) (get_local $op)))
                
                ;; $op = $here.op
                (set_local $op
                  (i32.and
                    (get_local $here)
                    (i32.const 255)
                  )
                )
                (if (i32.and (get_local $op) (i32.const 16)) (then
                  ;; distance base
                  (set_local $dist (i32.shr_u (get_local $here) (i32.const 16)))
                  (set_local $op (i32.and (get_local $op) (i32.const 15))) ;; number of extra bits
                  (if (i32.lt_u (get_local $bits) (get_local $op)) (then
                    (set_local $hold
                      (i32.add
                        (get_local $hold)
                        (i32.shl
                          (i32.load8_u (get_local $in))
                          (get_local $bits)
                        )
                      )
                    )
                    (set_local   $in (i32.add (get_local   $in) (i32.const 1)))
                    (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                    (if (i32.lt_u (get_local $bits) (get_local $op)) (then
                      (set_local $hold
                        (i32.add
                          (get_local $hold)
                          (i32.shl
                            (i32.load8_u (get_local $in))
                            (get_local $bits)
                          )
                        )
                      )
                      (set_local   $in (i32.add (get_local   $in) (i32.const 1)))
                      (set_local $bits (i32.add (get_local $bits) (i32.const 8)))
                    ))
                  ))
                  (set_local $dist (i32.add (get_local $dist)
                    (i32.and
                      (get_local $hold)
                      (i32.sub
                        (i32.shl (i32.const 1) (get_local $op))
                        (i32.const 1)
                      )
                    )
                  ))
                  (set_local $hold (i32.shr_u (get_local $hold) (get_local $op)))
                  (set_local $bits (i32.sub   (get_local $bits) (get_local $op)))
                  ;; Tracevv((stderr, "inflate:         distance %u\n", dist));
                  (set_local $op (i32.sub (get_local $out) (get_local $beg))) ;; max distance in output
                  (if (i32.gt_u (get_local $dist) (get_local $op)) (then
                    ;; see if copy from window
                    (set_local $op (i32.sub (get_local $dist) (get_local $op))) ;; distance back in window
                    (if (i32.gt_u (get_local $op) (get_local $whave)) (then
                      (if (i32.load (; sane ;) offset=7108 (get_local $state)) (then
                        ;; strm->msg = (char *)"invalid distance too far back";
                        ;; state->mode = BAD;
                        ;; break;
                        unreachable
                      ))
                    ))
                    (set_local $from (get_local $window))
                    (if (i32.eqz (get_local $wnext)) (then
                      ;; very common case
                      (set_local $from
                        (i32.add
                          (get_local $from)
                          (i32.sub (get_local $wsize) (get_local $op))
                        )
                      )
                      (if (i32.lt_u (get_local $op) (get_local $len)) (then
                        ;; some from window
                        
                        ;; len -= op; do { *out++ = *from++; } while (--op);
                        (set_local $len (i32.sub (get_local $len) (get_local $op)))
                        loop
                          (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                          (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                          (set_local $from (i32.add (get_local $from) (i32.const 1)))
                          (br_if 0 (tee_local $op (i32.sub (get_local $op) (i32.const 1))))
                        end
                        
                        ;; rest from output
                        (set_local $from (i32.sub (get_local $out) (get_local $dist)))
                      ))
                    )
                    (else
                      (if (i32.lt_u (get_local $wnext) (get_local $op)) (then
                        ;; wrap around window
                        (set_local $from
                          (i32.add
                            (get_local $from)
                            (i32.sub
                              (i32.add (get_local $wsize) (get_local $wnext))
                              (get_local $op)
                            )
                          )
                        )
                        (set_local $op (i32.sub (get_local $op) (get_local $wnext)))
                        (if (i32.lt_u (get_local $op) (get_local $len)) (then
                          ;; some from end of window

                          ;; len -= op; do { *out++ = *from++; } while (--op);
                          (set_local $len (i32.sub (get_local $len) (get_local $op)))
                          loop
                            (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                            (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                            (set_local $from (i32.add (get_local $from) (i32.const 1)))
                            (br_if 0 (tee_local $op (i32.sub (get_local $op) (i32.const 1))))
                          end

                          (set_local $from (get_local $window))
                          (if (i32.lt_u (get_local $wnext) (get_local $len)) (then
                            ;; some from start of window
                            (set_local $op (get_local $wnext))
                            
                            ;; len -= op; do { *out++ = *from++; } while (--op);
                            (set_local $len (i32.sub (get_local $len) (get_local $op)))
                            loop
                              (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                              (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                              (set_local $from (i32.add (get_local $from) (i32.const 1)))
                              (br_if 0 (tee_local $op (i32.sub (get_local $op) (i32.const 1))))
                            end
                            
                            ;; rest from output
                            (set_local $from (i32.sub (get_local $out) (get_local $dist)))
                          ))
                        ))
                      )
                      (else
                        ;; contiguous in window
                        (set_local $from
                          (i32.add
                            (get_local $from)
                            (i32.sub (get_local $wnext) (get_local $op))
                          )
                        )
                        (if (i32.lt_u (get_local $op) (get_local $len)) (then
                          ;; some from window
                          
                          ;; len -= op; do { *out++ = *from++; } while (--op);
                          (set_local $len (i32.sub (get_local $len) (get_local $op)))
                          loop
                            (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                            (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                            (set_local $from (i32.add (get_local $from) (i32.const 1)))
                            (br_if 0 (tee_local $op (i32.sub (get_local $op) (i32.const 1))))
                          end
                          
                          ;; rest from output
                          (set_local $from (i32.sub (get_local $out) (get_local $dist)))
                        ))
                      ))
                    ))
                    block $len_le_2
                      loop
                        (br_if $len_le_2 (i32.le_u (get_local $len) (i32.const 2)))
                        (i32.store8 offset=0 (get_local $out) (i32.load8_u offset=0 (get_local $from)))
                        (i32.store8 offset=1 (get_local $out) (i32.load8_u offset=1 (get_local $from)))
                        (i32.store8 offset=2 (get_local $out) (i32.load8_u offset=2 (get_local $from)))
                        (set_local  $out (i32.add (get_local  $out) (i32.const 3)))
                        (set_local $from (i32.add (get_local $from) (i32.const 3)))
                        (set_local  $len (i32.sub (get_local  $len) (i32.const 3)))
                        br 0
                      end
                    end $len_le_2
                    (if (get_local $len) (then
                      (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                      (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                      (set_local $from (i32.add (get_local $from) (i32.const 1)))
                      (if (i32.gt_u (get_local $len) (i32.const 1)) (then
                        (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                        (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                        (set_local $from (i32.add (get_local $from) (i32.const 1)))
                      ))
                    ))
                    br $do
                  ))
                  (set_local $from (i32.sub (get_local $out) (get_local $dist))) ;; copy direct from output
                  loop
                    ;; minimum length is 3
                    (i32.store8 offset=0 (get_local $out) (i32.load8_u offset=0 (get_local $from)))
                    (i32.store8 offset=1 (get_local $out) (i32.load8_u offset=1 (get_local $from)))
                    (i32.store8 offset=2 (get_local $out) (i32.load8_u offset=2 (get_local $from)))
                    (set_local  $out (i32.add (get_local  $out) (i32.const 3)))
                    (set_local $from (i32.add (get_local $from) (i32.const 3)))
                    (set_local  $len (i32.sub (get_local  $len) (i32.const 3)))
                    (br_if 0 (i32.gt_u (get_local $len) (i32.const 2)))
                  end
                  (if (get_local $len) (then
                    (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                    (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                    (set_local $from (i32.add (get_local $from) (i32.const 1)))
                    (if (i32.gt_u (get_local $len) (i32.const 1)) (then
                      (i32.store8 (get_local $out) (i32.load8_u (get_local $from)))
                      (set_local  $out (i32.add (get_local  $out) (i32.const 1)))
                      (set_local $from (i32.add (get_local $from) (i32.const 1)))
                    ))
                  ))
                  (br $do)
                ))
                (if (i32.eqz (i32.and (get_local $op) (i32.const 64))) (then
                  ;; 2nd level distance code
                  
                  ;; here = dcode[here.val + (hold & ((1U << op) - 1))];
                  (set_local $here (i32.load (get_local $dcode)
                    (i32.shl
                      (i32.add
                        (i32.shr_u (get_local $here) (i32.const 16)) ;; here.val
                        (i32.and
                          (get_local $hold)
                          (i32.sub
                            (i32.shl (i32.const 1) (get_local $op))
                            (i32.const 1)
                          )
                        )
                      )
                      (i32.const 2)
                    )
                  ))

                  (br $dodist)
                ))
                ;; strm->msg = (char *)"invalid distance code";
                ;; state->mode = BAD;
                ;; break
                unreachable
              end ;; loop $dodist
            ))
            (if (i32.eqz (i32.and (get_local $op) (i32.const 64))) (then
              ;; 2nd level length code
              
              ;; here = lcode[here.val + (hold & ((1U << op) - 1))];
              (set_local $here (i32.load (get_local $lcode)
                (i32.shl
                  (i32.add
                    (i32.shr_u (get_local $here) (i32.const 16)) ;; here.val
                    (i32.and
                      (get_local $hold)
                      (i32.sub
                        (i32.shl (i32.const 1) (get_local $op))
                        (i32.const 1)
                      )
                    )
                  )
                  (i32.const 2)
                )
              ))
              
              (br $dolen)
            ))
            (if (i32.and (get_local $op) (i32.const 32)) (then
              ;; end of block
              ;; Tracevv((stderr, "inflate:         end of block\n"));
              (i32.store (; mode ;) offset=4 (get_local $state) (i32.const (; TYPE ;) 16180))
              (br $break)
            ))
            ;; strm->msg = (char *)"invalid literal/length code";
            ;; state->mode = BAD;
            ;; break
            unreachable
          end ;; loop $dolen
        end $do
        (br_if $top
          (i32.and
            (i32.lt_u (get_local  $in) (get_local $last))
            (i32.lt_u (get_local $out) (get_local  $end))
          )
        )
      end ;; loop $top
    end $break

    ;; return unused bytes (on entry, $bits < 8, so $in won't go too far back)
    (set_local  $len (i32.shr_u (get_local $bits) (i32.const 3)))
    (set_local   $in (i32.sub   (get_local   $in) (get_local $len)))
    (set_local $bits (i32.sub   (get_local $bits) (i32.shl (get_local $len) (i32.const 3))))
    (set_local $hold
      (i32.and
        (get_local $hold)
        (i32.sub (i32.shl (i32.const 1) (get_local $bits)) (i32.const 1))
      )
    )

    ;; update state and return
    
    (i32.store (i32.add (get_local $strm) (get_global $z_stream.&next_in)) (get_local $in))
    (i32.store (i32.add (get_local $strm) (get_global $z_stream.&next_out)) (get_local $out))
    (i32.store (i32.add (get_local $strm) (get_global $z_stream.&avail_in))
      (select
        (i32.sub (i32.const 5) (i32.sub (get_local $in) (get_local $last)))
        (i32.add (i32.const 5) (i32.sub (get_local $last) (get_local $in)))
        (i32.lt_u (get_local $in) (get_local $last))
      )
    )
    (i32.store (i32.add (get_local $strm) (get_global $z_stream.&avail_out))
      (select
        (i32.add (i32.const 257) (i32.sub (get_local $end) (get_local $out)))
        (i32.sub (i32.const 257) (i32.sub (get_local $out) (get_local $end)))
        (i32.lt_u (get_local $out) (get_local $end))
      )
    )
    (i32.store (; hold ;) offset=60 (get_local $state) (get_local $hold))
    (i32.store (; bits ;) offset=64 (get_local $state) (get_local $bits))
  )
)
