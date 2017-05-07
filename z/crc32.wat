(module

  (import "memory" "main" (memory 1))
  (import "memory" "crc32Tables*" (global $ptr<reserved> i32))
  (global (export "initialValue") i32 i32.const 0)
  (global $sizeof<reserved> (export "sizeof crc32Tables") i32 i32.const 4096) (; 256 * 4 * 4 ;)
  (global $ptr<table0> (mut i32) i32.const -1)
  (global $ptr<table1> (mut i32) i32.const -1)
  (global $ptr<table2> (mut i32) i32.const -1)
  (global $ptr<table3> (mut i32) i32.const -1)

  (func $start (export "start")
    (local $c i32)
    (local $k i32)
    (local $poly i32)
    (local $ptr<base> i32)
    (local $ptr<entry> i32)
    (local $end<entry> i32)
    (local $ptr<entry2> i32)
    (set_local $poly (i32.const 0xedb88320))
    (set_local $ptr<base> (get_global $ptr<reserved>))
    (set_local $ptr<entry> (get_local $ptr<base>))
    (set_local $end<entry> (i32.add (get_local $ptr<entry>) (i32.const 1024))) (; 256 * 4 ;)
    loop
      (set_local $c (i32.shr_u
        (i32.sub (get_local $ptr<entry>) (get_local $ptr<base>))
        (i32.const 2)
      ))
      (set_local $k (i32.const 0))
      loop
        (set_local $c (i32.xor
          (i32.shr_u (get_local $c) (i32.const 1))
          (select
            (get_local $poly)
            (i32.const 0)
            (i32.and (get_local $c) (i32.const 1))
          )
        ))
        (br_if 0 (i32.lt_u (tee_local $k (i32.add (get_local $k) (i32.const 1))) (i32.const 8)))
      end
      (i32.store (get_local $ptr<entry>) (get_local $c))
      (br_if 0 (i32.lt_u
        (tee_local $ptr<entry> (i32.add (get_local $ptr<entry>) (i32.const 4)))
        (get_local $end<entry>)
      ))
    end
    (set_local $k (i32.const 8))
    loop
      (set_local $end<entry> (i32.add (get_local $ptr<entry>) (i32.const 1024)))
      (set_local $ptr<entry2> (get_local $ptr<base>))
      loop
        (set_local $c (i32.load (get_local $ptr<entry2>)))
        (i32.store (get_local $ptr<entry>) (i32.xor
          (i32.load (i32.add
            (get_local $ptr<base>)
            (i32.shl
              (i32.and (get_local $c) (i32.const 255))
              (i32.const 2)
            )
          ))
          (i32.shr_u (get_local $c) (get_local $k))
        ))
        (set_local $ptr<entry2> (i32.add (get_local $ptr<entry2>) (i32.const 4)))
        (br_if 0 (i32.lt_u
          (tee_local $ptr<entry> (i32.add (get_local $ptr<entry>) (i32.const 4)))
          (get_local $end<entry>)
        ))
      end
      (br_if 0 (i32.lt_u
        (tee_local $k (i32.add (get_local $k) (i32.const 8)))
        (i32.const 32)
      ))
    end
    (set_global $ptr<table0> (get_local $ptr<base>))
    (set_global $ptr<table1> (i32.add (get_global $ptr<table0>) (i32.const 1024)))
    (set_global $ptr<table2> (i32.add (get_global $ptr<table1>) (i32.const 1024)))
    (set_global $ptr<table3> (i32.add (get_global $ptr<table2>) (i32.const 1024)))
  )

  (func $dobyte (param $c i32) (param $byte i32) (result i32)
    (return (i32.xor
      (i32.load (i32.add
        (get_global $ptr<table0>)
        (i32.shl
          (i32.and
            (i32.xor (get_local $c) (get_local $byte))
            (i32.const 255)
          )
          (i32.const 2)
        )
      ))
      (i32.shr_u (get_local $c) (i32.const 8))
    ))
  )

  (func $doi32 (param $c i32) (param $i32 i32) (result i32)
    (set_local $c (i32.xor (get_local $c) (get_local $i32)))
    (return
      (i32.xor
        (i32.load
          (i32.add
            (get_global $ptr<table3>)
            (i32.and (i32.shl (get_local $c) (i32.const 2)) (i32.const 1020))
          )
        )
        (i32.xor
          (i32.load
            (i32.add
              (get_global $ptr<table2>)
              (i32.and (i32.shr_u (get_local $c) (i32.const 6)) (i32.const 1020))
            )
          )
          (i32.xor
            (i32.load
              (i32.add
                (get_global $ptr<table1>)
                (i32.and (i32.shr_u (get_local $c) (i32.const 14)) (i32.const 1020))
              )
            )
            (i32.load
              (i32.add
                (get_global $ptr<table0>)
                (i32.and (i32.shr_u (get_local $c) (i32.const 22)) (i32.const 1020))
              )
            )
          )
        )
      )
    )
  )

  (func (export "crc32") (param $crc i32) (param $ptr<buf> i32) (param $end<buf> i32) (result i32)
    (local $end<buf4> i32)
    (set_local $end<buf4> (i32.and (get_local $end<buf>) (i32.const -4)))
    (set_local $crc (i32.xor (get_local $crc) (i32.const -1)))
    block $done

      block $prefix
        loop
          (br_if $done (i32.ge_u (get_local $ptr<buf>) (get_local $end<buf>)))
          (br_if $prefix (i32.eqz (i32.and (get_local $ptr<buf>) (i32.const 3))))
          (set_local $crc (call $dobyte (get_local $crc) (i32.load8_u (get_local $ptr<buf>))))
          (set_local $ptr<buf> (i32.add (get_local $ptr<buf>) (i32.const 1)))
          br 0
        end
      end $prefix

      block $rep4
        loop
          (br_if $rep4 (i32.ge_u (get_local $ptr<buf>) (get_local $end<buf4>)))
          (set_local $crc (call $doi32 (get_local $crc) (i32.load (get_local $ptr<buf>))))
          (set_local $ptr<buf> (i32.add (get_local $ptr<buf>) (i32.const 4)))
          br 0
        end
      end $rep4

      loop
        (br_if $done (i32.ge_u (get_local $ptr<buf>) (get_local $end<buf>)))
        (set_local $crc (call $dobyte (get_local $crc) (i32.load8_u (get_local $ptr<buf>))))
        (set_local $ptr<buf> (i32.add (get_local $ptr<buf>) (i32.const 1)))
        br 0
      end

    end $done
    (return (i32.xor (get_local $crc) (i32.const -1)))
  )

  (; (start $start) ;)

)
