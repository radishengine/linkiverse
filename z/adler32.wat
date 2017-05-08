(module

  (import "memory" "main" (memory 0))

  (global (export "initialValue") i32 i32.const 1)
  
  (func (export "adler32") (param $s1 i32) (param $ptr<buf> i32) (param $end<buf> i32)
    (local $s2 i32)
    (local $sizeof<chunk> i32)
    (local $end<chunk> i32)
    (local $end<align4> i32)
    (local $fourbytes i32)
    (set_local $s2 (i32.shr_u (get_local $s1) (i32.const 16)))
    (set_local $s1 (i32.and (get_local $s1) (i32.const 0xffff)))
    
    block $done
      
      ;; bring ptr<buf> up to 32-bit boundary
      (if (i32.and (get_local $ptr<buf>) (i32.const 3)) (then
        loop
          (br_if $done (i32.ge_u (get_local $ptr<buf>) (get_local $end<buf>)))
          (set_local $s2 (i32.add (get_local $s2)
            (tee_local $s1 (i32.add (get_local $s1) (i32.load8_u (get_local $ptr<buf>))))
          ))
          (br_if 0 (i32.and
            (tee_local $ptr<buf> (i32.add (get_local $ptr<buf>) (i32.const 1)))
            (i32.const 3)
          ))
        end
        (set_local $s1 (i32.rem_u (get_local $s1) (i32.const 65521)))
        (set_local $s2 (i32.rem_u (get_local $s2) (i32.const 65521)))
      ))

      loop
        (br_if $done (i32.ge_u (get_local $ptr<buf>) (get_local $end<buf>)))

        (set_local $sizeof<chunk> (i32.sub (get_local $end<buf>) (get_local $ptr<buf>)))
        (set_local $sizeof<chunk> (select
          (i32.const 5552)
          (get_local $sizeof<chunk>)
          (i32.gt_u (get_local $sizeof<chunk>) (i32.const 5552))
        ))

        (set_local $end<chunk> (i32.add (get_local $ptr<buf>) (get_local $sizeof<chunk>)))
        (set_local $end<align4> (i32.and (get_local $end<chunk>) (i32.const -4)))

        (if (i32.lt_u (get_local $ptr<buf>) (get_local $end<align4>)) (then
          loop
            (set_local $fourbytes (i32.load (get_local $ptr<buf>)))
            (set_local $s2 (i32.add (get_local $s2)
              (tee_local $s1 (i32.add (get_local $s1) (i32.and (get_local $fourbytes) (i32.const 255))))
            ))
            (set_local $s2 (i32.add (get_local $s2)
              (tee_local $s1 (i32.add (get_local $s1) (i32.and (i32.shr_u (get_local $fourbytes) (i32.const 8)) (i32.const 255))))
            ))
            (set_local $s2 (i32.add (get_local $s2)
              (tee_local $s1 (i32.add (get_local $s1) (i32.and (i32.shr_u (get_local $fourbytes) (i32.const 16)) (i32.const 255))))
            ))
            (set_local $s2 (i32.add (get_local $s2)
              (tee_local $s1 (i32.add (get_local $s1) (i32.shr_u (get_local $fourbytes) (i32.const 24))))
            ))
            (br_if 0 (i32.lt_u
              (tee_local $ptr<buf> (i32.add (get_local $ptr<buf>) (i32.const 4)))
              (get_local $end<align4>)
            ))
          end
        ))
        
        (if (i32.lt_u (get_local $ptr<buf>) (get_local $end<chunk>)) (then
          loop
            (set_local $s2 (i32.add (get_local $s2)
              (tee_local $s1 (i32.add (get_local $s1) (i32.load8_u (get_local $ptr<buf>))))
            ))
            (br_if 0 (i32.lt_u
              (tee_local $ptr<buf> (i32.add (get_local $ptr<buf>) (i32.const 1)))
              (get_local $end<chunk>)
            ))
          end
        ))

        (set_local $s1 (i32.rem_u (get_local $s1) (i32.const 65521)))
        (set_local $s2 (i32.rem_u (get_local $s2) (i32.const 65521)))
        br 0
      end
      unreachable
    
    end $done
    
    (return (i32.or
      (i32.shl (get_local $s2) (i32.const 16))
      (get_local $s1)
    ))
  )
  
)
